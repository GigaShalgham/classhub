export default [
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        MutationObserver: 'readonly', IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly', setInterval: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
        navigator: 'readonly', console: 'readonly', Notification: 'readonly',
        __BOOTSTRAP__: 'readonly', __IS_MIRROR__: 'readonly', __LIVE_ORIGIN__: 'readonly',
        __MIRROR_DATE__: 'readonly', location: 'readonly', history: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-self-compare': 'error',
      'no-cond-assign': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'no-unsafe-negation': 'error',
    },
  },
];
