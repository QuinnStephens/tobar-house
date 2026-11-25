// Who's signed in, for the app's menu.
export const onRequestGet = ({ data }) =>
  new Response(JSON.stringify({ email: data.user?.email || '', service: data.user?.service || '' }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
