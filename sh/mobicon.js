#!/usr/bin/env node

'use strict';

const mobicon = require('mobicon');

mobicon('assets/images/icons/leerstandsmelder_icon.png', {
	platform: 'android',
	dest: 'assets/images/icons/android/',
	background: '#ff0000',
	contentRatio: 1
}).then(() => {
	// icons generated
	console.log('Icons for android generated');
});

mobicon('assets/images/icons/leerstandsmelder_icon.png', {
	platform: 'ios',
	dest: 'assets/images/icons/ios/',
	background: '#ff0000',
	contentRatio: 1
}).then(() => {
	// icons generated
	console.log('Icons for ios generated');
});
