const express = require('express');
const passport = require('passport');
const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

console.log('🔐 Google Auth - CLIENT_URL:', CLIENT_URL);

router.get(
  '/',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

router.get(
  '/callback',
  (req, res, next) => {
    console.log('📍 Google callback hit');
    console.log('Query params:', req.query);
    next();
  },
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=google_auth_failed`
  }),
  (req, res) => {
    console.log('✅ Google auth success, user:', req.user?.user?.email);
    const { user, token } = req.user;

    const redirectUrl = new URL(`${CLIENT_URL}/auth/google/success`);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('userId', user._id.toString());

    console.log('🔄 Redirecting to:', redirectUrl.toString());
    res.redirect(redirectUrl.toString());
  }
);

module.exports = router;
