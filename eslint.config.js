'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'node_modules/',
            'public/js/',
            'public/mp3/',
            'public/wav/',
            'public/data/',
            'public/fonts/',
            'public/img/',
            'public/cache.manifest',
            'public/pacman-canvas.js',
        ],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
    },
];
