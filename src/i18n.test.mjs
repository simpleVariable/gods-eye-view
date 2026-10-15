import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, normalizeLocale, translateText } from './i18n.js';

test('Spanish is the default locale and unsupported locales fall back to Spanish', () => {
  assert.equal(DEFAULT_LOCALE, 'es');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('fr'), 'es');
});

test('known interface copy translates to Spanish and can be rendered in English', () => {
  assert.equal(translateText('DATA LAYERS'), 'CAPAS DE DATOS');
  assert.equal(translateText('CAPAS DE DATOS', 'en'), 'DATA LAYERS');
  assert.equal(translateText('Search any location...'), 'Buscar cualquier ubicación...');
  assert.equal(translateText('Choose your first view'), 'Elige tu primera vista');
  assert.equal(translateText('GROUND SPEED'), 'VELOCIDAD SOBRE EL SUELO');
  assert.equal(translateText('MEDIO AMBIENTE', 'en'), 'ENVIRONMENTAL');
});

test('untranslated content passes through unchanged', () => {
  assert.equal(translateText('CelesTrak'), 'CelesTrak');
  assert.equal(translateText('CelesTrak', 'en'), 'CelesTrak');
});
