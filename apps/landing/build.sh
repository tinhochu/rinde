#!/bin/sh
# Builds the static site into $1 (default dist): fills in the origins and gives static assets
# content-hashed names so they can be cached for a year.
set -eu
OUT="${1:-dist}"
SITE_ORIGIN="${SITE_ORIGIN:-https://rinde.cool.chuventures.com}"
APP_ORIGIN="${APP_ORIGIN:-https://app.rinde.cool.chuventures.com}"
API_ORIGIN="${API_ORIGIN:-https://rinde-api.cool.chuventures.com}"

rm -rf "$OUT"
mkdir -p "$OUT/en" "$OUT/static"
cp index.html 404.html sw.js "$OUT/"
cp en/index.html "$OUT/en/"
cp og/og-es.png og/og-en.png "$OUT/"
cp static/* "$OUT/static/"

# Rename static/<name>.<ext> to <name>.<hash>.<ext> and rewrite references in the given files.
hashed() {
  file="$1"; shift
  sum=$(md5sum "$OUT/static/$file" | cut -c1-10)
  name="${file%.*}.$sum.${file##*.}"
  mv "$OUT/static/$file" "$OUT/static/$name"
  for ref in "$@"; do sed -i.bak "s#$file#$name#g" "$ref" && rm "$ref.bak"; done
}

PAGES="$OUT/index.html $OUT/en/index.html $OUT/404.html"
# Fonts first: the stylesheet names them, so its hash follows theirs.
hashed bricolage-400.woff2 "$OUT/static/styles.css" $PAGES
hashed bricolage-700.woff2 "$OUT/static/styles.css" $PAGES
for asset in styles.css handoff.js page.js icon-192.png apple-touch-icon.png; do hashed "$asset" $PAGES; done

for page in $PAGES; do
  sed -i.bak -e "s#__SITE_ORIGIN__#$SITE_ORIGIN#g" -e "s#__APP_ORIGIN__#$APP_ORIGIN#g" -e "s#__API_ORIGIN__#$API_ORIGIN#g" "$page"
  rm "$page.bak"
done
