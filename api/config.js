// GET /config -> { gumroad_url, enforced }
const A = require('./_lib/auth');
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    gumroad_url: (process.env.GUMROAD_URL || 'https://tirach.gumroad.com/l/yiifii').trim(),
    enforced: A.paymentsOn(),          // set PAYMENTS=off in Vercel to open the site for testing
  });
};
