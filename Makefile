build: src/**
	bun build src/extension.ts \
		--external "gi://*" \
		--external "resource://*" \
		--outfile extension.js

attach: build
	./attach.sh 

clean:
	rm -f extension.js

log:
	journalctl --user -f | grep --line-buffered gnome-shell