/**
 * Enlaces para abrir el bot con el código de un solo uso.
 * t.me acaba en tg:// y falla si no hay app. La web usa https y el mismo
 * destino, dentro del hash, para que el navegador no busque un protocolo.
 */

const USERNAME = /^[A-Za-z0-9_]{5,32}$/;
const CODE = /^[a-f0-9]{64}$/;

export type TelegramLinkUrls = {
  /** Para copiar al teléfono, donde sí está la app. */
  appUrl: string;
  /** Se abre en el navegador. El esquema de la página es https. */
  webUrl: string;
};

/** Arma los dos enlaces. Null si el usuario o el código no tienen la forma esperada. */
export function telegramLinkUrls(username: string, code: string): TelegramLinkUrls | null {
  if (!USERNAME.test(username) || !CODE.test(code)) return null;
  const appUrl = `https://t.me/${username}?start=${code}`;
  const deep = `tg://resolve?domain=${username}&start=${code}`;
  const webUrl = `https://web.telegram.org/a/#?tgaddr=${encodeURIComponent(deep)}`;
  return { appUrl, webUrl };
}
