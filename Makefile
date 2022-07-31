# To build, install:
#   - Ruby
#   - Gems: asciidoctor, asciidoctor-diagram, and coderay
# then run `make`

book: docs/UsersGuide.html

docs/UsersGuide.html: docs/*.adoc
	bundle exec asciidoctor -o docs/UsersGuide.html -b html5 -r asciidoctor-diagram docs/UsersGuide.adoc

docker-build:
	docker run -it -v $$(pwd)/docs:/docs asciidoctor/docker-asciidoctor asciidoctor -o /docs/UsersGuide.html -b html5 -r asciidoctor-diagram /docs/UsersGuide.adoc

.PHONY: docker-build
