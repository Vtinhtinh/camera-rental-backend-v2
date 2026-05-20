const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const generateToken = (id) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log('🔑 Google OAuth - Profile received:', profile?.displayName, profile?.emails?.[0]?.value);
      try {
        const existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          const token = generateToken(existingUser._id);
          return done(null, { user: existingUser, token });
        }

        const existingEmailUser = await User.findOne({ email: profile.emails[0].value });

        if (existingEmailUser) {
          existingEmailUser.googleId = profile.id;
          if (!existingEmailUser.avatar && profile.photos[0]?.value) {
            existingEmailUser.avatar = profile.photos[0].value;
          }
          await existingEmailUser.save();
          const token = generateToken(existingEmailUser._id);
          return done(null, { user: existingEmailUser, token });
        }

        const user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          avatar: profile.photos[0]?.value || '',
          password: null,
          role: 'user'
        });

        const token = generateToken(user._id);
        done(null, { user, token });
      } catch (error) {
        done(error, null);
      }
    }
  )
);

passport.serializeUser((data, done) => {
  done(null, data);
});

passport.deserializeUser((data, done) => {
  done(null, data);
});

module.exports = passport;
