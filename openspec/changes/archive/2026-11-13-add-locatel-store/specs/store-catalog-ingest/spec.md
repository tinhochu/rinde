## ADDED Requirements

### Requirement: Locatel catalog source
Locatel's online prices SHALL be read from Locatel's public VTEX catalog search at `https://www.locatelcolombia.com/api/catalog_system/pub/products/search`, whose robots.txt does not disallow `/api/`, with Rinde's own User-Agent and the default pace. Only the offer of Locatel's own seller (seller `1`) SHALL count as a Locatel price; if that seller doesn't sell the product, Rinde shows no Locatel price for it.

#### Scenario: Locatel search
- **WHEN** ingest searches Locatel for "leche deslactosada"
- **THEN** "Leche Alpina Deslactosada X 200Ml" is saved with EAN 7702001044481, size 200 ml, Locatel's own price, its source URL and the time it was seen
