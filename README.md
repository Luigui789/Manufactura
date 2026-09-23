# EcoSoap ERP

ERP web para **EcoSoap Nicaragua S.A.**, empresa manufacturera de jabón ecológico elaborado a
partir de aceite de cocina usado. Proyecto de la asignatura Sistemas de Manufactura, carrera de
Ingeniería de Sistemas.

El sistema integra cuatro módulos —Compras, Inventario, Producción y Ventas— sobre un único
flujo de negocio, desde la compra de materia prima hasta el despacho del producto terminado.

> Repositorio recién inicializado. La configuración del monorepo llega en
> `feature/project-setup`; este README se ampliará con las instrucciones de instalación y
> ejecución al integrarse esa rama.

## Stack

| Capa            | Tecnologías                                                      |
| --------------- | ---------------------------------------------------------------- |
| Frontend        | React, TypeScript, Vite, Tailwind CSS, shadcn/ui                 |
| Backend         | NestJS, TypeScript, REST, Swagger/OpenAPI                        |
| Persistencia    | PostgreSQL, Prisma ORM                                           |
| Infraestructura | Docker Compose, pnpm workspaces                                  |

## Flujo de ramas

```text
main        versiones estables
  └── develop        integración
        └── feature/*      trabajo en curso
```

Todo desarrollo parte de `develop`. Ninguna persona modifica `main` directamente y ningún pull
request se fusiona sin la revisión de otro integrante.
