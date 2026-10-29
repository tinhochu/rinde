# Spec Delta

## Purpose

A public page at Rinde's root domain that tells a first-time visitor (a shopper or a hackathon judge) what Rinde does, why its prices can be trusted, and how to start, then sends them into the app.

## ADDED Requirements

### Requirement: Landing page at the root domain
The root domain SHALL serve the marketing page, not the app. The page SHALL be a standalone site that does not load the app's code and does not require an account, cookies or a device session. It SHALL be fully available in both Spanish, at `/`, and English, at `/en`, with the same sections and content in each. A visible switch between the two SHALL keep the visitor on the same section. A visitor on `/` whose browser prefers English and not Spanish SHALL see a prominent "Read in English" link at the top. The page SHALL NOT redirect automatically, so shared links always open in the language they were shared in. Each version SHALL declare its language and point to the other as its alternate, so search engines and link previews pick the right one. Unknown paths that are not app paths (see `app-domain-move`) SHALL show a not-found page with a link back to `/`.

#### Scenario: First visit
- **WHEN** someone opens `https://rinde.cool.chuventures.com/` in a browser tab
- **THEN** they see the Rinde landing page in Spanish, without the app's tab bar or sign-in prompts

#### Scenario: Switching to English
- **WHEN** a visitor on `/` chooses "English"
- **THEN** `/en` opens with the same content in English, and its switch leads back to `/`

#### Scenario: English-speaking visitor
- **WHEN** a visitor whose browser language is `en-US` opens `/`
- **THEN** the Spanish page loads with a "Read in English" link at the top leading to `/en`, without an automatic redirect

#### Scenario: Comparison in English
- **WHEN** the live comparison is shown on `/en`
- **THEN** prices keep the Colombian peso format ("$12.490 COP") and the age reads in English ("2 h ago")

### Requirement: What the page tells the visitor
The page SHALL state, in plain language and in this order of prominence:
- what Rinde does: compares grocery prices at D1, Jumbo and Éxito in Colombia, and plans where a shopping list costs least;
- how to use it: search or build a list, see the plan by store, and send a receipt (photo or electronic invoice) to earn points that keep community prices fresh;
- where prices come from: the stores' online catalogs and shoppers' receipts, each shown with when it was seen. The AI reads and matches products but never invents a price.

The page SHALL NOT claim savings amounts, percentages, user counts, ratings or testimonials that are not backed by data Rinde has. It SHALL NOT show logos of the stores; stores are named in text only.

#### Scenario: Reading the price promise
- **WHEN** a visitor reaches the section about where prices come from
- **THEN** it says prices come from store catalogs and shoppers' receipts with the time they were seen, and that the AI never makes up a price

#### Scenario: No invented claims
- **WHEN** the page is reviewed
- **THEN** it contains no figure such as "ahorra hasta 30%" or "10.000 usuarios" unless that figure is computed from Rinde's data at the time it is shown

### Requirement: Live price comparison
The page SHALL show one real comparison of a common product across at least two of the stores, taken from Rinde's public catalog search when the page loads. It SHALL show each store's price exactly as returned, with the product name, pack size and how long ago each price was seen (for example "hace 3 h"), and SHALL mark the cheapest store. The product SHALL be chosen from a short fixed list of staples (for example eggs, rice, milk) as the first one with prices from at least two stores. If no staple has prices from two stores, the request fails, or it takes more than 4 seconds, the comparison SHALL be replaced by text that explains the comparison without numbers. The page SHALL NEVER display a price that is stored in the page, cached from an earlier visit, estimated or rounded.

#### Scenario: Comparison available
- **WHEN** the catalog returns "Huevos AA x30" at D1 for $12.490 seen 2 h ago and at Jumbo for $15.590 seen 5 h ago
- **THEN** the page shows both prices as returned, "hace 2 h" and "hace 5 h", and marks D1 as the cheapest

#### Scenario: API unavailable
- **WHEN** the catalog request fails or exceeds 4 seconds
- **THEN** no price is shown and the comparison area shows its explanatory text instead; the rest of the page works

#### Scenario: Only one store has prices
- **WHEN** every staple on the list has prices from only one store
- **THEN** no comparison is shown, and the page does not present one store's price alone as a comparison

### Requirement: Calls to action into the app
The page SHALL have a primary action "Abrir Rinde" ("Open Rinde" in English) in the first screen and again at the end of the page, opening the app at the app domain. It SHALL explain how to install the app on the phone's home screen. On browsers that offer the install prompt, it SHALL send the visitor to the app, where the install card prompts. On iPhone it SHALL show the steps (Compartir → Agregar a inicio → Agregar) to follow once the app is open. The page SHALL NOT itself register as an installable app.

#### Scenario: Opening the app
- **WHEN** a visitor taps "Abrir Rinde"
- **THEN** `https://app.rinde.cool.chuventures.com/` opens in the same tab

#### Scenario: iPhone install help
- **WHEN** a visitor on iPhone Safari opens the install help
- **THEN** the page shows the three steps to add Rinde to the home screen from the app

### Requirement: Link previews
The page SHALL provide a title, a description, and an Open Graph and Twitter card image (1200×630) in each language. A link shared in WhatsApp, X, LinkedIn or Slack SHALL then preview with Rinde's name, a one-line description and the image. The preview image SHALL contain no prices.

#### Scenario: Shared on WhatsApp
- **WHEN** the root URL is pasted into a WhatsApp chat
- **THEN** the preview shows the Rinde title, the Spanish description and the preview image

### Requirement: Fast on a low-end phone
The page SHALL be usable on a low-end Android phone on a slow 4G connection:
- the first screen's text and primary action SHALL appear before any script runs;
- the total transfer for the first view, excluding the live comparison request, SHALL stay under 200 KB;
- it SHALL load no third-party scripts, trackers or fonts from other origins;
- static assets SHALL be served with long-lived caching, and the HTML with revalidation.

#### Scenario: Script blocked
- **WHEN** the page loads with JavaScript disabled
- **THEN** all text, the language switch and "Abrir Rinde" work; only the live comparison is replaced by its explanatory text

#### Scenario: Page weight
- **WHEN** the Spanish page is loaded with an empty cache
- **THEN** the transferred bytes, excluding the catalog request, are under 200 KB

### Requirement: Accessible and responsive
The page SHALL work from 320 px wide phones to desktop without horizontal scrolling. Text and controls SHALL meet WCAG AA contrast in both light and dark color schemes, following the device setting. Every action SHALL be reachable and visibly focused by keyboard. Images SHALL have text alternatives, and the price comparison SHALL be readable by screen readers as store, price and age. Motion SHALL be limited to at most one entrance effect and SHALL be off when the device asks for reduced motion.

#### Scenario: Narrow phone
- **WHEN** the page is viewed at 320 px width
- **THEN** no content is cut off and the page does not scroll sideways

#### Scenario: Screen reader on the comparison
- **WHEN** a screen reader reaches the live comparison
- **THEN** it reads each store with its price and how long ago it was seen, and which store is cheapest
