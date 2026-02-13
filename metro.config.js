const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

const zustandCjsAliases = {
  zustand: path.resolve(__dirname, 'node_modules/zustand/index.js'),
  'zustand/vanilla': path.resolve(__dirname, 'node_modules/zustand/vanilla.js'),
  'zustand/middleware': path.resolve(__dirname, 'node_modules/zustand/middleware.js'),
  'zustand/shallow': path.resolve(__dirname, 'node_modules/zustand/shallow.js'),
  'zustand/react/shallow': path.resolve(__dirname, 'node_modules/zustand/react/shallow.js'),
  'zustand/traditional': path.resolve(__dirname, 'node_modules/zustand/traditional.js'),
  'zustand/context': path.resolve(__dirname, 'node_modules/zustand/context.js'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliasedPath = zustandCjsAliases[moduleName];
  if (aliasedPath) {
    return {
      type: 'sourceFile',
      filePath: aliasedPath,
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
