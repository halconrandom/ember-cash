/**
 * Auditoría del bot: una línea por update recibido, con el id del update de
 * Telegram, el comando que se resolvió y el resultado. `command` y `result`
 * siempre vienen de un vocabulario cerrado (nombres de comando y claves de
 * error ya tipadas en otros archivos de lib/telegram) y nunca de lo que
 * escribió la persona: jamás llevan el texto del mensaje, un payload ni una
 * imagen. Va a los logs del servidor (Vercel), nunca al cliente.
 */
export function logTelegramEvent(updateId: number | null, command: string, result: string): void {
  console.log(
    "[Ember Cash] telegram",
    JSON.stringify({ update_id: updateId, command, result }),
  );
}
