import Model from "./model.js";

const makeEventTarget = () => {
	try {
		return new EventTarget();
	} catch {
		return new DocumentFragment();
	}
};

const checkBooleanFlag = (params, id, defaultValue = true) => {
	const value = params.get(id);
	if (value == null) {
		return defaultValue;
	}
	return value !== "" && value !== "false" && parseFloat(value) != 0;
};

export default (async () => {
	const urlParams = new URLSearchParams(window.location.search);
	const settings = {
		id: "excel_97_egg_settings",
		location: urlParams.get("l"),
		demo: urlParams.get("demo"),
		sanitizePosition: checkBooleanFlag(urlParams, "sanitizePosition"),
		interactive: checkBooleanFlag(urlParams, "interactive"),
		cursed: checkBooleanFlag(urlParams, "cursed", false),
	};
	const events = makeEventTarget();
	const settingsChangedEvent = new Event("settingsChanged");

	const toolbar = document.querySelector("command-bar");
	const aboutButton = toolbar.querySelector(".mso-button#about");
	const aboutBox = document.querySelector("#about-box");
	const screenshot = document.querySelector("screenshot");
	const fullscreenCheckbox = toolbar.querySelector(".mso-button#fullscreen");
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

	if (settings.cursed) {
		toolbar.remove();
	}

	const toggleAboutBox = () => {
		aboutBox.classList.toggle("hidden");
		aboutBox.contentWindow.scrollTo(0, 0);
	};

	const hideAboutBox = () => aboutBox.classList.add("hidden");

	const showScreenshot = () => screenshot.classList.remove("hidden");

	const hideScreenshot = () => screenshot.classList.add("hidden");

	const updateSettings = () => {
		let options = "";

		checkboxes.forEach((checkbox) => {
			const id = checkbox.id.replace(/(-[a-z])/g, (s) =>
				s.substr(1).toUpperCase()
			);
			settings[id] = checkbox.checked;
			if (checkbox.checked) {
				options += checkbox.getAttribute("data-key");
			}
		});

		urlParams.set("o", options);
		history.replaceState({}, "", "?" + unescape(urlParams.toString()));

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

		aboutBox.contentWindow.postMessage(settings, "*");

		events.dispatchEvent(settingsChangedEvent);
	};

	toolbar.addEventListener("click", (event) => {
		if (event.target.tagName.toLowerCase() === "input") {
			updateSettings();
		}
	});

	aboutButton.addEventListener("click", (event) => {
		toggleAboutBox();
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

	screenshot.addEventListener("mousedown", (event) => hideScreenshot());

	document.addEventListener("keydown", async (event) => {
		if (
			event.repeat ||
			event.ctrlKey ||
			event.altKey ||
			event.metaKey ||
			event.shiftKey
		) {
			return;
		}

		const isScreenshotVisible = !screenshot.classList.contains("hidden");
		const isAboutBoxVisible = !aboutBox.classList.contains("hidden");

		if (event.code === "Escape" || event.code === "F12") {
			if (event.code === "Escape" && isAboutBoxVisible) {
				hideAboutBox();
				return;
			} else if (!isScreenshotVisible) {
				showScreenshot();
				return;
			}
		}

		if (isScreenshotVisible) {
			hideScreenshot();
		}

		if (event.code === "Space" && toolbar.contains(event.target)) {
			event.preventDefault();
			return;
		}

		if (!settings.cursed) {
			if (event.code === "KeyA") {
				toggleAboutBox();
				return;
			}

			const checkbox = checkboxesByKeyCode[event.code];

			if (checkbox != null && !checkbox.disabled) {
				checkbox.checked = !checkbox.checked;
				updateSettings();
			}
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

	if (settings.cursed) {
		options = "crs";
	}

	// Music can't be on by default.
	options = options.replaceAll("m", "");

	checkboxes.forEach(
		(checkbox) =>
			(checkbox.checked = options.includes(checkbox.getAttribute("data-key")))
	);

	const reportPosition = (x, y) => {
		if (!settings.interactive) {
			return;
		}
		urlParams.set("l", `${x},${y}`);
		history.replaceState({}, "", "?" + unescape(urlParams.toString()));
	};

	updateSettings();

	return {
		events,
		settings,
		reportPosition,
	};
})();
