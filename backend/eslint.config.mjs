// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Configuracion de ESLint del backend.
 *
 * Es independiente de la del frontend a proposito: aqui el entorno es Node con
 * decoradores, y alla es navegador con React. Prettier vive en la raiz del
 * monorepo, por eso esta configuracion solo desactiva las reglas de estilo que
 * chocarian con el (eslint-config-prettier) en lugar de formatear.
 */
export default tseslint.config(
  {
    ignores: ['dist/', 'src/generated/', 'coverage/', 'node_modules/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          // El tsconfig incluye todos los .ts del backend, pero no los .mjs.
          // Sin esta excepcion el linting con tipos falla al analizar su propia
          // configuracion.
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS usa decoradores e inyeccion por tipos; 'any' aparece de forma
      // legitima en los limites del framework.
      '@typescript-eslint/no-explicit-any': 'off',
      // Una promesa sin await en un servicio transaccional es un bug silencioso.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
