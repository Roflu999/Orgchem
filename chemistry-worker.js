'use strict';
importScripts('chemistry.js');
self.onmessage = function (event) {
  try {
    const result = Chem.enumerate(event.data.parsed, { onProgress: progress => self.postMessage({ request: event.data.request, progress }) });
    self.postMessage({ request: event.data.request, result });
  } catch (error) {
    self.postMessage({ request: event.data.request, error: error.message || 'The formula could not be enumerated.' });
  }
};
