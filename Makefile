build: src/**
	bun build src/extension.ts \
		--external "gi://GLib" \
		--external "gi://Meta" \
		--external "resource:///org/gnome/shell/extensions/extension.js" \
		--external "resource:///org/gnome/shell/ui/main.js" \
		--outfile extension.js

attach: build
	./attach.sh 

clean:
	rm -f extension.js

log:
	journalctl --user -f | grep --line-buffered gnome-shell