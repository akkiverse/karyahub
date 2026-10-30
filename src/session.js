// Who is signed in (CR-0005). The server holds the session in an HttpOnly cookie; the browser only
// keeps what the server last said about the person, in memory, so nothing sensitive is stored on the device.
export function createSession(initial = null) {
  let current = initial && initial.signed_in ? initial : null;
  return {
    get: () => current,
    set(me) { current = me && me.signed_in ? me : null; },
    end() { current = null; },
  };
}
