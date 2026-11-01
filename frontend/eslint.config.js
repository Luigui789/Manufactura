// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Configuracion de ESLint del frontend.
 *
 * Es independiente de la del backend a proposito: aqui el entorno es el
 * navegador con React, y alla es Node con decoradores. Prettier vive en la raiz
 * del monorepo, por eso esta configuracion solo desactiva las reglas de estilo
 * que chocarian con el en lugar de formatear.
 */
export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'src/components/ui/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // En eslint-plugin-react-hooks 7 la entrada 'recommended-latest' de primer
  // nivel sigue el formato antiguo de eslintrc (plugins como array de strings);
  // la version para flat config vive bajo configs.flat.
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
