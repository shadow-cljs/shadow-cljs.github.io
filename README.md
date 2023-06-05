# shadow-cljs User's Guide

See https://shadow-cljs.github.io/docs/UsersGuide.html


The guide is written in asciidoc format available in the `/docs` directory.

`make` is used to build the primary HTML file via [asciidoctor](http://asciidoctor.org/).

## Contribution

Contributions are very welcome. Just open an issue or pull request.

### Dockerfile

People who prefer developing against a Docker container can use the `Dockerfile` provided in this repository. It contains everything that you need:

- Ruby
- Bundler
- Make

### Visual Studio Code

Provided that you have the "Visual Studio Code Dev Containers" [extension](https://code.visualstudio.com/docs/devcontainers/containers) installed, Visual Studio Code users will be able to develop against the Docker container immediately.

# Generate HTML using docker

1. Install docker

2. Build the docs using docker:

```bash
make docker-build
```
