const b = require('../../server/backend');
exports.handler = async event => {
  try {
    b.guard(event, ['POST']);
    const input = b.body(event);
    if (input.action === 'create') {
      const id = b.requestId(input.requestId);
      const order = {
        name: b.text(input.name, 80, true), email: b.email(input.email),
        type: b.text(input.type, 80, true), budget: b.text(input.budget, 120),
        description: b.text(input.description, 4000, true), reference: b.text(input.reference, 2000),
      };
      if (!b.types.includes(order.type) || input.termsAccepted !== true) throw new b.HttpError(400, 'Check the commission type and accept the terms.');
      const fingerprint = b.hash(JSON.stringify(order));
      const accessToken = b.hmac(b.config().secret, `order:${id}:${fingerprint}`);
      const result = await b.upstream('createOrder', { order, requestId: id, fingerprint, accessToken }, event);
      return b.response(200, { status: 'ok', number: result.number, emailSent: result.emailSent === true });
    }
    if (input.action === 'track') {
      const result = await b.upstream('trackOrder', { tokenHash: b.hash(b.token(input.token)) }, event);
      const { number, type, status, message, updatedAt } = result.order || {};
      return b.response(200, { status: 'ok', order: { number, type, status, message, updatedAt } });
    }
    if (input.action === 'recover') {
      const requestId = input.requestId == null ? b.randomUUID() : b.requestId(input.requestId);
      await b.upstream('queueRecovery', { email: b.email(input.email), requestId }, event);
      return b.response(202, { status: 'ok', message: 'If there are orders associated with this email, we will send recovery instructions. Please allow a few minutes.' });
    }
    if (input.action === 'confirm') {
      const accessToken = b.randomBytes(32).toString('base64url');
      await b.upstream('confirmRecovery', { tokenHash: b.hash(b.token(input.token)), accessHash: b.hash(accessToken) }, event);
      return b.response(200, { status: 'ok', token: accessToken });
    }
    throw new b.HttpError(400, 'Unknown action.');
  } catch (error) { return b.failure(error); }
};
