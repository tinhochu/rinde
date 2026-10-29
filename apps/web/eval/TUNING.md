# Tuning the same-product prompt, 29 October 2026

Two sets of cases from the barcode answer key (see `RESULTS.md`): the **tuning set** (120 cases), whose mistakes guided each change, and the **held-out set** (95 cases, other products), used to see whether a change helps on products it never saw. The packaging rule below came from reading held-out mistakes, so the held-out set has been seen once.

| Prompt, reasoning effort | Tuning set: correct | wrong picks | Held-out: correct | wrong picks | Median time |
| --- | --- | --- | --- | --- | --- |
| Original, low (before) | 89.2 % | 7 | 85.3 % | 3 | 2.0 s |
| Brand, line and variety rules, low | 87.5 % | 7 | 86.3 % | 4 | 2.0 s |
| Same, medium | 89.2 % | 5 | 87.4 % | 4 | 2.9 to 3.5 s |
| Same, high | 90.0 % | 5 | | | 4.2 s |
| Plus the packaging rule, low (shipped) | 90.0 % | 4 | 86.3 % | 4 | 2.0 s |
| Word rule, no AI | 57.5 % | 1 | 44.2 % | 0 | |

What it shows:
- Muse finds the same product about twice as often as the word rule: 86 to 90 % correct against 44 to 58 %.
- Prompt wording and more reasoning moved the numbers by one to two points, about what two runs of the same prompt differ by. Wrong picks fell from 7 to 4 on the tuning set but not on the held-out set, so the gain is not proven.
- Asking twice and keeping only answers both runs agree on did not remove a wrong pick: they are steady judgments, not slips.
- Most remaining mistakes come from the stores' names: Éxito and Carulla call three Karavansay flours "Harina Karavansay precocida", one barcode is "harina de yuca" at one store and "tapioca" at another, and some listings are the same product under two barcodes.
- One rule made things worse and was fixed: telling Muse that packaging words only describe a product made it match milk in a bag with milk in a carton, which are different products at different prices.

The shipped prompt keeps low effort (same speed as before) with the brand, line, variety and packaging rules, which are right on their own terms even where they don't move the score.

## Product photos, 29 October 2026

Muse can also see the stores' own product photos (made small, 400 px, by the stores' image server). Three ways to use them, on the same cases:

| When Muse sees the photos | Tuning set: correct | wrong picks | Held-out: correct | wrong picks | Median time |
| --- | --- | --- | --- | --- | --- |
| Never (names only, with "not sure") | 89.2 % | 4 | 84.2 % | 4 | 2.0 s |
| Only when the names leave it not sure | 93.3 % | 4 | 88.4 % | 3 | 2.0 s |
| Whenever two or more listings could be it (shipped) | **99.2 %** | **1** | **97.9 %** | **0** | 2.8 s |

The one wrong pick left on the tuning set is none-10, which a person had already marked as Muse being right (the same aguardiente under another barcode). The held-out set's two misses: a tamarind whose two stores name different brands, and sardines "picantes en tomate" against plain "tomate".

Two stores often show the same manufacturer photo, which makes a case easy. Comparing the photos by how they look (a difference hash after trimming the white background, 6 bits or fewer of 64 counted as the same picture), the gain holds where the photos differ:

| Cases (find) | Names only | Photos when not sure | Photos on two or more |
| --- | --- | --- | --- |
| Tuning set, photos look different (47) | 41 | 45 | 47 |
| Tuning set, photos look the same (32) | 28 | 29 | 32 |
| Held-out, photos look different (42) | 35 | 36 | 40 |
| Held-out, photos look the same (36) | 30 | 33 | 36 |
| Cases without the product, tuning set (40) and held-out (15) | 37 and 13 | 37 and 13 | 39 and 15 |

The photo look happened after the prompt work above, and it was chosen on both sets at once, so both have now been seen. The photos fix the mistakes the names could not: milk in a bag against a carton, the Karavansay flours the stores all call "precocida", Café Quindío lines. They cost about 0.8 s more per judgment, and only when two or more listings could be it.
