## ADDED Requirements

### Requirement: Euro catalog source
Euro's online prices SHALL be read from Euro's public VTEX catalog search at `https://www.eurosupermercados.com.co/api/catalog_system/pub/products/search`, with Rinde's own User-Agent and the default pace. Euro's robots.txt disallows URLs with a query string; the catalog is read anyway by product decision (2026-11-18). Only the offer of Euro's own seller (seller `1`) SHALL count as a Euro price; if that seller doesn't sell the product, Rinde shows no Euro price for it.

#### Scenario: Euro search
- **WHEN** ingest searches Euro for "leche deslactosada"
- **THEN** "LECHE DESLACTOSADA CODELAC *1100ML" is saved with EAN 7707727655065, size 1100 ml, Euro's own price, its source URL and the time it was seen
