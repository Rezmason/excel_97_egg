import Model from "./model.js";

const makeEventTarget = () => {
	try {
		return new EventTarget();
	} catch {
		return new DocumentFragment();
	}
};

export default (async () => {
	const settings = {};
	const events = makeEventTarget();
	const settingsChangedEvent = new Event("settingsChanged");

	const toolbar = document.querySelector("toolbar");
	const aboutButton = toolbar.querySelector("button#about");
	const fullscreenCheckbox = toolbar.querySelector("input#fullscreen");
	fullscreenCheckbox.disabled = !(
		document.fullscreenEnabled || document.webkitFullscreenEnabled
	);
	const checkboxes = Array.from(
		toolbar.querySelectorAll("input[type='checkbox']")
	);

	const checkboxesByKeyCode = Object.fromEntries(
		checkboxes.map((checkbox) => [
			checkbox.getAttribute("data-keycode"),
			checkbox,
		])
	);

	const showAboutBox = () => {
		// TODO: about box
	};

	const updateSettings = () => {
		checkboxes.forEach(({ id, checked }) => {
			id = id.replace(/(_[a-z])/g, (s) => s.substr(1).toUpperCase());
			settings[id] = checked;
		});

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

	updateSettings();

	return {
		events,
		settings,
	};
})();
