#!/usr/bin/env node
/**
 * Patch serialize-javascript to work with Node.js 22+
 *
 * The generateUID function uses crypto.getRandomValues without checking
 * if crypto is available. This fails in Node.js 22+ where crypto is not
 * globally available in all contexts.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'serialize-javascript', 'index.js');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if already patched
    if (content.includes('var nodeCrypto = require')) {
        console.log('serialize-javascript already patched');
        process.exit(0);
    }

    // Replace the generateUID function
    const oldFunction = `function generateUID() {
    var bytes = crypto.getRandomValues(new Uint8Array(UID_LENGTH));
    var result = '';
    for(var i=0; i<UID_LENGTH; ++i) {
        result += bytes[i].toString(16);
    }
    return result;
}`;

    const newFunction = `function generateUID() {
    var bytes;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        bytes = crypto.getRandomValues(new Uint8Array(UID_LENGTH));
    } else {
        var nodeCrypto = require('crypto');
        bytes = nodeCrypto.randomBytes(UID_LENGTH);
    }
    var result = '';
    for(var i=0; i<UID_LENGTH; ++i) {
        result += bytes[i].toString(16);
    }
    return result;
}`;

    content = content.replace(oldFunction, newFunction);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully patched serialize-javascript for Node.js 22+ compatibility');
} catch (error) {
    console.error('Failed to patch serialize-javascript:', error.message);
    process.exit(1);
}
