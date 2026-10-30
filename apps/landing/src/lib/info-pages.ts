import type { Lang } from './landing-copy';

// About, contact and privacy: one text per language, rendered as HTML (InfoPage) and as Markdown (agent-docs).
// Every statement here describes what the app does today; change the text when the app changes.

export const CONTACT_EMAIL = 'tin@chuventures.com';
export const POSTAL_ADDRESS = { street: '2082 Hwy 183, Ste 170 PMB806', locality: 'Leander', region: 'TX', postalCode: '78641', country: 'US' };
const postal = `${POSTAL_ADDRESS.street}, ${POSTAL_ADDRESS.locality}, ${POSTAL_ADDRESS.region} ${POSTAL_ADDRESS.postalCode}`;

export type InfoSlug = 'about' | 'contact' | 'privacy';
export const INFO_SLUGS: InfoSlug[] = ['about', 'contact', 'privacy'];

export type InfoPage = { title: string; nav: string; description: string; sections: { heading: string; paragraphs: string[] }[] };

export const infoPath = (slug: InfoSlug, lang: Lang) => `${lang === 'en' ? '/en' : ''}/${slug}/`;

export const infoPages: Record<Lang, Record<InfoSlug, InfoPage>> = {
  es: {
    about: {
      title: 'Sobre Rinde',
      nav: 'Sobre Rinde',
      description: 'Qué es Rinde, quién lo hace y de dónde salen sus precios.',
      sections: [
        { heading: 'Qué es', paragraphs: [
          'Rinde es un comparador de precios de supermercado para Colombia. Escribes tu lista de mercado como la escribirías en un papel, y Rinde busca cada producto en D1, Jumbo, Éxito y Carulla, revisa los precios en vivo y te dice dónde comprar cada cosa, cuánto pagas en total y cuánto ahorras frente a comprar todo en una sola tienda.',
          'Si te pasas del presupuesto, Rinde propone cambios (otra tienda, otra marca, un empaque más pequeño o dejar algo opcional), cada uno con su ahorro exacto, y no cambia nada hasta que tú lo aceptes. También planea el recorrido desde el supermercado al que sueles ir, a pie, en bus, en moto o en carro.',
        ] },
        { heading: 'De dónde salen los precios', paragraphs: [
          'Los precios vienen de los catálogos en línea de cada tienda y de las facturas que comparten las personas. Cada precio muestra la tienda, el enlace a su página y la hora en que lo vimos. Rinde nunca inventa ni estima un precio: si una tienda no responde, lo decimos.',
          'Meta Muse, el modelo de inteligencia artificial de Meta, lee listas y facturas, decide si dos productos de tiendas distintas son el mismo y explica las rutas. Nunca produce, ve ni ajusta un precio; todas las cuentas las hace el código.',
        ] },
        { heading: 'Quién lo hace', paragraphs: [
          'Rinde es un proyecto independiente hecho en Colombia, creado para el Meta Global AI Developer Hackathon. No tiene relación con D1, Jumbo, Éxito ni Carulla, y no recibe pagos de ninguna tienda. Es gratis y no necesitas cuenta para usarlo.',
        ] },
      ],
    },
    contact: {
      title: 'Contacto',
      nav: 'Contacto',
      description: 'Cómo escribirle a Rinde: preguntas, precios que no cuadran y solicitudes sobre tus datos.',
      sections: [
        { heading: 'Escríbenos', paragraphs: [
          `Para cualquier pregunta sobre Rinde, escribe a ${CONTACT_EMAIL}. Respondemos en español o en inglés.`,
          'Si un precio no coincide con lo que viste en la tienda, cuéntanos el producto, la tienda, la sede si fue en persona y la hora en que lo viste. Los precios cambian por sede y por día, y cada precio en Rinde muestra cuándo lo vimos, así que esos datos nos ayudan a encontrar la diferencia.',
        ] },
        { heading: 'Tus datos', paragraphs: [
          `Para pedir una copia de tus datos o que los borremos, escribe a ${CONTACT_EMAIL} desde el correo de tu cuenta. Si tienes cuenta, también puedes eliminarla tú mismo en Perfil → Mi cuenta dentro de la app. Lo que guardas sin cuenta vive solo en tu dispositivo y lo borras desde la app.`,
        ] },
        { heading: 'Tiendas y prensa', paragraphs: [
          'Si representas a una tienda y quieres corregir cómo aparece un producto, o si escribes sobre Rinde, usa el mismo correo e indica en el asunto de qué se trata.',
        ] },
        { heading: 'Dirección postal', paragraphs: [`${postal}, Estados Unidos. Para cualquier asunto, el correo es más rápido.`] },
      ],
    },
    privacy: {
      title: 'Privacidad',
      nav: 'Privacidad',
      description: 'Qué datos usa Rinde, dónde se guardan y cómo borrarlos.',
      sections: [
        { heading: 'Sin cuenta', paragraphs: [
          'No necesitas cuenta para comparar precios. Tu lista, tus favoritos, tu zona y tu plan guardado se guardan en tu dispositivo, no en nuestro servidor. Para comparar, nuestro servidor consulta los nombres de los productos en los catálogos de las tiendas; no les envía nada sobre ti.',
        ] },
        { heading: 'Fotos de listas y facturas', paragraphs: [
          'Si lees una lista o una factura con una foto, la enviamos a nuestro servidor y al modelo Meta Muse para extraer los productos y los precios impresos. Las fotos de facturas se borran a los 30 días; los precios que salen de ellas quedan como precios de la tienda, sin tus datos.',
          'Si reenvías una factura electrónica a tu dirección de Rinde, leemos el archivo de la factura para sacar la tienda, la fecha y los productos con sus precios. Una factura solo puede pertenecer a una cuenta.',
        ] },
        { heading: 'Ubicación y rutas', paragraphs: [
          'Si usas “Usar mi ubicación” para planear una ruta, tu ubicación se envía a nuestro servidor solo para calcular la ruta y no se guarda. Si escribes una dirección, la buscamos en OpenStreetMap (Nominatim). Los mapas se cargan desde OpenStreetMap.',
        ] },
        { heading: 'Si creas una cuenta', paragraphs: [
          'Guardamos tu nombre y tu correo para que tus puntos y tus facturas te acompañen en otros dispositivos. Los códigos de acceso llegan por correo, enviados por Resend. Puedes eliminar tu cuenta en Perfil → Mi cuenta; tus aportes de precios quedan anónimos.',
        ] },
        { heading: 'Lo que no hacemos', paragraphs: [
          `No vendemos datos, no mostramos publicidad y no compartimos tu información con las tiendas. La app cuenta instalaciones de forma anónima, sin identificarte. Para preguntas o para borrar tus datos, escribe a ${CONTACT_EMAIL}.`,
        ] },
      ],
    },
  },
  en: {
    about: {
      title: 'About Rinde',
      nav: 'About',
      description: 'What Rinde is, who makes it and where its prices come from.',
      sections: [
        { heading: 'What it is', paragraphs: [
          'Rinde is a grocery price comparison app for Colombia. You write your shopping list the way you would on paper, and Rinde finds each item at D1, Jumbo, Éxito and Carulla, checks the prices live, and tells you where to buy what, what you pay in total, and how much you save against buying everything at one store.',
          'If you go over budget, Rinde proposes changes (another store, another brand, a smaller pack, or dropping an optional item), each with its exact saving, and changes nothing until you accept. It also plans the trip from the supermarket you usually go to, on foot, by bus, by moto or by car.',
        ] },
        { heading: 'Where the prices come from', paragraphs: [
          'Prices come from each store’s online catalog and from receipts people share. Every price shows the store, a link to its page and the time we saw it. Rinde never invents or estimates a price: when a store doesn’t answer, we say so.',
          'Meta Muse, Meta’s AI model, reads lists and receipts, decides whether two listings at different stores are the same product, and explains routes. It never produces, sees or adjusts a price; code does all the arithmetic.',
        ] },
        { heading: 'Who makes it', paragraphs: [
          'Rinde is an independent project made in Colombia, built for the Meta Global AI Developer Hackathon. It is not affiliated with D1, Jumbo, Éxito or Carulla and takes no money from any store. It is free and needs no account.',
        ] },
      ],
    },
    contact: {
      title: 'Contact',
      nav: 'Contact',
      description: 'How to reach Rinde: questions, prices that don’t match, and requests about your data.',
      sections: [
        { heading: 'Write to us', paragraphs: [
          `For any question about Rinde, write to ${CONTACT_EMAIL}. We answer in Spanish or English.`,
          'If a price doesn’t match what you saw at the store, tell us the product, the store, the branch if you were there in person, and when you saw it. Prices change by branch and by day, and every price in Rinde shows when we saw it, so those details help us find the difference.',
        ] },
        { heading: 'Your data', paragraphs: [
          `To ask for a copy of your data or to have it deleted, write to ${CONTACT_EMAIL} from your account’s email address. If you have an account, you can also delete it yourself in Perfil → Mi cuenta in the app (the app is in Spanish). What you keep without an account lives only on your device, and you delete it from the app.`,
        ] },
        { heading: 'Stores and press', paragraphs: [
          'If you represent a store and want to correct how a product appears, or if you are writing about Rinde, use the same address and say what it is about in the subject line.',
        ] },
        { heading: 'Mailing address', paragraphs: [`${postal}, United States. Email is faster for anything.`] },
      ],
    },
    privacy: {
      title: 'Privacy',
      nav: 'Privacy',
      description: 'What data Rinde uses, where it is kept and how to delete it.',
      sections: [
        { heading: 'No account needed', paragraphs: [
          'You don’t need an account to compare prices. Your list, favorites, area and saved plan are kept on your device, not on our server. To compare, our server looks up product names in the stores’ catalogs; it sends them nothing about you.',
        ] },
        { heading: 'Photos of lists and receipts', paragraphs: [
          'If you read a list or a receipt from a photo, we send it to our server and to the Meta Muse model to extract the products and the printed prices. Receipt photos are deleted after 30 days; the prices taken from them stay as store prices, without your details.',
          'If you forward an electronic invoice to your Rinde address, we read the invoice file to get the store, the date and the products with their prices. An invoice can only belong to one account.',
        ] },
        { heading: 'Location and routes', paragraphs: [
          'If you use “Usar mi ubicación” (use my location) to plan a route, your location is sent to our server only to work out the route and is not stored. If you type an address, we look it up on OpenStreetMap (Nominatim). Maps load from OpenStreetMap.',
        ] },
        { heading: 'If you create an account', paragraphs: [
          'We keep your name and email so your points and receipts follow you to other devices. Sign-in codes arrive by email, sent through Resend. You can delete your account in Perfil → Mi cuenta; your price contributions stay anonymous.',
        ] },
        { heading: 'What we don’t do', paragraphs: [
          `We don’t sell data, show ads or share your information with the stores. The app counts installs anonymously, without identifying you. For questions or to delete your data, write to ${CONTACT_EMAIL}.`,
        ] },
      ],
    },
  },
};
