// =========================================================================
// note RSS取得スクリプト
// 新潟県立長岡大手高等学校 公式note の RSS を取得し、JSONに変換して保存します。
// GitHub Actions から定期実行されることを想定しています。
//
// 実行: node scripts/fetch-rss.js
// 出力: data/news.json
// 依存: Node.js 18以上の標準ライブラリのみ(外部パッケージ不要)
// =========================================================================

const fs = require('fs');
const path = require('path');

const RSS_URL = 'https://nagaokaohte-hs.note.jp/rss';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'news.json');
const MAX_ITEMS = 6; // events.html(6件)表示、index.html(1件)はその中から先頭1件を使用

// ---------- ユーティリティ ----------

/** XMLタグ内のCDATAやエスケープを取り除く */
function decodeXmlText(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** HTMLタグを削除して本文プレーンテキストを返す */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 単一<item>...</item>から必要要素を抽出 */
function parseItem(itemXml) {
  const get = (tag) => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
    const m = itemXml.match(re);
    return m ? decodeXmlText(m[1]).trim() : '';
  };

  const title = get('title');
  const link = get('link');
  const pubDate = get('pubDate');
  const description = get('description');

  // 抜粋(本文先頭90字、「続きをみる」を除去)
  const excerptRaw = stripHtml(description)
    .replace(/続きをみる。?$/, '')
    .trim();
  const excerpt = excerptRaw.length > 90
    ? excerptRaw.slice(0, 90) + '…'
    : excerptRaw;

  // 公開日を YYYY/MM/DD に整形
  let dateLabel = '';
  if (pubDate) {
    const d = new Date(pubDate);
    if (!isNaN(d)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateLabel = `${y}/${m}/${day}`;
    }
  }

  // アイキャッチ画像URL取得（RSS内から優先順位順に試行）
  let image = '';
  // 1. <enclosure url="..."> （自己終了タグ）
  const enclosureMatch = itemXml.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enclosureMatch) image = enclosureMatch[1];
  // 2. <media:thumbnail url="...">
  if (!image) {
    const mediaMatch = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
    if (mediaMatch) image = mediaMatch[1];
  }
  // 3. <media:content url="...">
  if (!image) {
    const mediaContentMatch = itemXml.match(/<media:content[^>]+url="([^"]+)"/i);
    if (mediaContentMatch) image = mediaContentMatch[1];
  }
  // 4. description内の最初の<img src="...">
  if (!image) {
    const imgMatch = description.match(/<img[^>]+src="([^"]+)"/i);
    if (imgMatch) image = imgMatch[1];
  }

  return {
    title,
    link,
    date: dateLabel,
    excerpt,
    image,
  };
}

/** RSS全体から<item>...</item>を抽出 */
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    items.push(parseItem(m[1]));
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

// ---------- og:image 取得（RSS取得失敗時のフォールバック） ----------

/**
 * 記事ページのHTMLから og:image メタタグの画像URLを取得する
 * note記事ページには必ず og:image が設定されており、
 * カバー画像・本文先頭画像を問わず代表画像を取得できる
 * @param {string} articleUrl - note記事のURL
 * @returns {Promise<string>} - 画像URL、取得できなければ空文字
 */
async function fetchOgImage(articleUrl) {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'ohte-note-fetcher (GitHub Actions)',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) {
      console.log(`[fetch-rss]   og:image HTTP ${res.status}: ${articleUrl}`);
      return '';
    }
    const html = await res.text();
    // <meta property="og:image" content="..."> の2パターンに対応
    const match =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    return match ? match[1] : '';
  } catch (err) {
    console.log(`[fetch-rss]   og:image取得失敗: ${err.message}`);
    return '';
  }
}

/**
 * image が空のアイテムだけ og:image で補完する
 * @param {Array} items
 * @returns {Promise<Array>}
 */
async function enrichWithImages(items) {
  const enriched = [];
  for (const item of items) {
    if (!item.image && item.link) {
      console.log(`[fetch-rss] og:image取得: ${item.link}`);
      const image = await fetchOgImage(item.link);
      if (image) {
        console.log(`[fetch-rss]   → 画像取得成功: ${image.slice(0, 60)}...`);
      } else {
        console.log(`[fetch-rss]   → 画像なし`);
      }
      enriched.push({ ...item, image });
      // サーバー負荷軽減のため少し待機
      await new Promise(r => setTimeout(r, 800));
    } else {
      if (item.image) {
        console.log(`[fetch-rss] RSS画像あり: ${item.link}`);
      }
      enriched.push(item);
    }
  }
  return enriched;
}

// ---------- メイン処理 ----------

async function main() {
  console.log(`[fetch-rss] RSS取得開始: ${RSS_URL}`);

  let xml;
  try {
    const res = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'ohte-note-fetcher (GitHub Actions)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    xml = await res.text();
  } catch (err) {
    console.error(`[fetch-rss] RSS取得失敗: ${err.message}`);
    // 既存JSONがあれば上書きせず終了(古いデータを維持)
    if (fs.existsSync(OUTPUT_PATH)) {
      console.error('[fetch-rss] 既存JSONを維持して終了します');
      process.exit(1);
    }
    // 初回かつ取得失敗 → 空のデータを書いておく(HTML側で「現在記事を取得できません」表示)
    const empty = {
      generated_at: new Date().toISOString(),
      source: RSS_URL,
      error: err.message,
      items: [],
    };
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(empty, null, 2), 'utf-8');
    process.exit(1);
  }

  const items = parseRss(xml);
  console.log(`[fetch-rss] ${items.length}件の記事を抽出`);

  if (items.length === 0) {
    console.error('[fetch-rss] 記事が0件のため、JSONを更新せず終了します');
    process.exit(1);
  }

  // RSSで画像が取れなかった記事をoEmbedで補完
  const rssImageCount = items.filter(i => i.image).length;
  console.log(`[fetch-rss] RSS画像あり: ${rssImageCount}/${items.length}件`);

  let enrichedItems = items;
  if (rssImageCount < items.length) {
    console.log('[fetch-rss] oEmbed APIで残りの画像URL取得中...');
    enrichedItems = await enrichWithImages(items);
  }

  const finalImageCount = enrichedItems.filter(i => i.image).length;
  console.log(`[fetch-rss] 最終的に画像あり: ${finalImageCount}/${enrichedItems.length}件`);

  const output = {
    generated_at: new Date().toISOString(),
    source: RSS_URL,
    items: enrichedItems,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[fetch-rss] 書き込み完了: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[fetch-rss] 想定外のエラー:', err);
  process.exit(1);
});
