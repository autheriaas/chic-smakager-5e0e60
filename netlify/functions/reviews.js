const b = require('../../server/backend');
exports.handler = async event => {
  try {
    b.guard(event, ['GET', 'POST']);
    if (event.httpMethod === 'GET') {
      const result = await b.upstream('listReviews', {}, event);
      return b.response(200, { avgRating: result.avgRating, ratingCount: result.ratingCount, reviews: result.reviews });
    }
    const input = b.body(event);
    const data = { requestId: b.requestId(input.requestId), name: b.text(input.name, 80) || 'Anonymous', text: b.text(input.text, 600, true), rating: input.rating };
    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || data.text.length < 3) throw new b.HttpError(400, 'Add a rating and a short review.');
    await b.upstream('createReview', data, event);
    return b.response(200, { status: 'ok' });
  } catch (error) { return b.failure(error); }
};
