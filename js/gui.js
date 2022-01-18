import Model from "./model.js";

const makeEventTarget = () => {
	try {
		return new EventTarget();
	} catch {
		return new DocumentFragment();
	}
};

export default (async () => {
	const urlParams = new URLSearchParams(window.location.search);
	const settings = {
		location: urlParams.get("location"),
	};
	const events = makeEventTarget();
	const settingsChangedEvent = new Event("settingsChanged");

	const toolbar = document.querySelector("toolbar");
	const aboutButton = toolbar.querySelector("button#about");
	const aboutBox = document.querySelector("iframe#about_box");
	const canvas = document.querySelector("canvas");
	const fullscreenCheckbox = toolbar.querySelector("input#fullscreen");
	fullscreenCheckbox.disabled = !(
		document.fullscreenEnabled || document.webkitFullscreenEnabled
	);
	const checkboxes = Array.from(
		toolbar.querySelectorAll("input[type='checkbox']")
	);

	const checkboxesByKeyCode = Object.fromEntries(
		checkboxes.map((checkbox) => [
			"Key" + checkbox.getAttribute("data-key").toUpperCase(),
			checkbox,
		])
	);

	const showAboutBox = () => {
		aboutBox.classList.remove("hidden");
	};

	const hideAboutBox = () => {
		aboutBox.classList.add("hidden");
	};

	const updateSettings = () => {
		let options = "";

		checkboxes.forEach((checkbox) => {
			const id = checkbox.id.replace(/(_[a-z])/g, (s) =>
				s.substr(1).toUpperCase()
			);
			settings[id] = checkbox.checked;
			if (checkbox.checked) {
				options += checkbox.getAttribute("data-key");
			}
		});

		urlParams.set("o", options);
		history.replaceState({}, "", "?" + urlParams.toString());

		if (settings.fullscreen) {
			if (document.fullscreenEnabled) {
				document.body.requestFullscreen();
			} else if (document.webkitFullscreenEnabled) {
				document.body.webkitRequestFullscreen();
			}
		} else {
			if (document.fullscreenEnabled) {
				if (document.fullscreenElement != null) {
					document.exitFullscreen();
				}
			} else if (document.webkitFullscreenEnabled) {
				if (document.webkitFullscreenElement == null) {
					document.webkitExitFullscreen();
				}
			}
		}

		events.dispatchEvent(settingsChangedEvent);
	};

	toolbar.addEventListener("click", (event) => {
		if (event.target.tagName.toLowerCase() === "input") {
			updateSettings();
		}
	});

	aboutButton.addEventListener("click", (event) => {
		showAboutBox();
	});

	const fullscreenChangeEventType = document.fullscreenEnabled
		? "fullscreenchange"
		: "webkitfullscreenchange";
	document.addEventListener(fullscreenChangeEventType, (event) => {
		let isFullscreen;
		if (document.fullscreenEnabled) {
			isFullscreen = document.fullscreenElement != null;
		} else if (document.webkitFullscreenEnabled) {
			isFullscreen = document.webkitFullscreenElement != null;
		}
		const changed = isFullscreen != fullscreenCheckbox.checked;
		fullscreenCheckbox.checked = isFullscreen;
		if (changed) {
			updateSettings();
		}
	});

	document.addEventListener("keydown", async (event) => {
		if (event.repeat) {
			return;
		}

		if (event.code === "Space") {
			if (toolbar.contains(event.target)) {
				event.preventDefault();
			}

			// TODO: handbrake
			return;
		}

		if (event.code === "Escape") {
			hideAboutBox();
			return;
		}

		if (event.code === "KeyA") {
			showAboutBox();
			return;
		}

		const checkbox = checkboxesByKeyCode[event.code];

		if (checkbox != null && !checkbox.disabled) {
			checkbox.checked = !checkbox.checked;
			updateSettings();
		}
	});

	document.addEventListener("keyup", async (event) => {
		if (event.code === "Space" && toolbar.contains(event.target)) {
			event.preventDefault();
		}
	});

	let options = urlParams.get("o");
	switch (options) {
		case null:
		case "original":
			options = "crs";
			break;
		case "deluxe":
			options = "tg";
			break;
		case "vaporwave":
			options = "qtg";
			break;
	}

	checkboxes.forEach(
		(checkbox) =>
			(checkbox.checked = options.includes(checkbox.getAttribute("data-key")))
	);

	updateSettings();

	return {
		events,
		settings,
	};
})();
