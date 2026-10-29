# app-domain-move Specification

## Purpose
Moves the Rinde app (the Expo web PWA) from the root domain to `app.rinde.cool.chuventures.com` so the root can hold the landing page. Existing links, installed apps and on-device data keep working.

## Requirements

### Requirement: The app is served from the app subdomain
The app SHALL be served at `https://app.rinde.cool.chuventures.com` with the same behavior, manifest, icons, service worker and API as before. Its install scope and start URL SHALL be that origin. The API SHALL accept requests and sign-in from this origin, from the landing origin (for the catalog search only as used by the page), and from the existing native and local development origins. Links the system sends, such as the review link in reply emails, SHALL point to the app subdomain.

#### Scenario: Using the app at its new address
- **WHEN** a user opens `https://app.rinde.cool.chuventures.com/` and searches "arroz"
- **THEN** results load from the API as they did on the old address

#### Scenario: Signing in on the new address
- **WHEN** a user signs in with an email code on the app subdomain
- **THEN** sign-in succeeds and the session persists across reloads

#### Scenario: Reply email link
- **WHEN** a forwarded invoice is accepted and a reply is sent
- **THEN** the reply's review link starts with `https://app.rinde.cool.chuventures.com/`

### Requirement: Old app links redirect
A request to the root domain for a path the app owns (its screens, such as the receipt review, plan, profile and search routes, plus the app's static bundles) SHALL be redirected permanently to the same path and query on the app subdomain. Paths that belong to the landing page SHALL NOT be redirected.

#### Scenario: Old review link
- **WHEN** someone opens an earlier reply email's link `https://rinde.cool.chuventures.com/receipt/abc123`
- **THEN** they are redirected to `https://app.rinde.cool.chuventures.com/receipt/abc123`

#### Scenario: Landing paths stay
- **WHEN** someone opens `https://rinde.cool.chuventures.com/en`
- **THEN** the English landing page is served without a redirect

### Requirement: Installed apps are carried over
When the root domain is opened as an installed app (standalone display mode, as an icon installed before the move does), it SHALL immediately open the app on the app subdomain instead of showing the landing page. The user SHALL then be told once, in the app, that Rinde moved and they can reinstall it from this address. The root domain SHALL replace the old app service worker with one that removes the old app caches and does not cache app pages. After that, a stale copy of the app SHALL NOT be served from the root domain.

#### Scenario: Opening an icon installed before the move
- **WHEN** a user taps the Rinde icon installed from the root domain
- **THEN** the app opens on the app subdomain, not the landing page or a cached old app

#### Scenario: Old service worker
- **WHEN** a browser that had the old app's service worker visits the root domain
- **THEN** the service worker is replaced, the old app caches are removed, and the landing page is shown from the network

### Requirement: On-device data moves with the app
On-device data stored by the app on the root domain SHALL be offered to the app subdomain once when a user moves from the root domain to the app. This includes the device session, cart, favorites, preferences, saved plan draft, searches and picks, seen badges, theme, and linked account marker. The data SHALL be passed directly from the browser to the app without being sent to or stored by the server. The app SHALL import it only when it has no data of its own yet, and SHALL never overwrite existing data. After handing the data over, the root domain SHALL mark it as handed over and SHALL NOT offer it again. It SHALL keep its copy for 30 days as a backup and then remove it.

#### Scenario: Points and session survive the move
- **WHEN** an anonymous user with 120 points and a forwarding address opens the installed icon after the move
- **THEN** the app on the subdomain shows the same points, forwarding address, cart and favorites

#### Scenario: App already has data
- **WHEN** the user already used the app on the subdomain and then opens an old root-domain link
- **THEN** the app keeps its own data and ignores the handoff

#### Scenario: Data not sent to the server
- **WHEN** the handoff happens
- **THEN** no request to any server carries the handed-over data, and it does not appear in server logs or the redirect's URL query
