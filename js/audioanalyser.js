// @fileoverview A system that plays and provides analyser data from a loaded WAV file
// @author Jeremy Sachs
// @version 1.0.0

// Web audio is in working draft, and receives less attention than other features.
// Chrome won't allow web audio to initialize without a user gesture.
// Safari has implemented audio analysis of buffer sources, but not media element sources.
// Firefox seems ahead of the curve on most fronts, but there is still
// the matter of finding an audio format that all these browsers can support as well.

// Consequently, there are more hurdles than usual to jump through in this code.

const AudioContext = [window.AudioContext, window.webkitAudioContext].find(
	(contextClass) => contextClass != null
);

const fromMediaElement = async (audioContext, analyser, path) => {
	let audio = new Audio(path);
	audio.loop = true;
	let audioNode = audioContext.createMediaElementSource(audio);
	audioNode.connect(analyser);

	let playing = false;

	const play = () => {
		if (!playing) {
			playing = true;
			audio.currentTime = 0;
			return audio.play();
		}
	};

	const stop = () => {
		if (playing) {
			playing = false;
			audio.pause();
		}
	};

	audio.currentTime = 0;
	try {
		await play();
		return { play, stop };
	} catch (e) {
		audioNode.disconnect();
		audioNode = null;
		audio = null;
		throw e;
	}
};

const fromBuffer = async (audioContext, analyser, path) => {
	const arrayBuffer = await (await fetch(path)).arrayBuffer();
	const audioBuffer = await new Promise((resolve, reject) =>
		audioContext.decodeAudioData(arrayBuffer, resolve, reject)
	);

	let audio = null;

	const play = () => {
		if (audio == null) {
			audio = audioContext.createBufferSource();
			audio.connect(analyser);
			audio.buffer = audioBuffer;
			audio.loop = true;
			audio.start();
		}
	};

	const stop = () => {
		if (audio != null) {
			audio.stop();
			audio.disconnect();
			audio = null;
		}
	};

	play();
	return { play, stop };
};

export default class AudioAnalyser {
	constructor(path) {
		this.path = path;
		this.playing = false;
		this.binCount = 2 ** 7;
		this.minDecibels = -100;
		this.maxDecibels = -30;
		this.data = new Float32Array(this.binCount);
		this.data.fill(this.minDecibels);
	}

	update() {
		if (this.playing && this.analyser != null) {
			this.analyser.getFloatFrequencyData(this.data);
			if (Math.abs(this.data[0]) === Infinity) {
				this.data.fill(this.minDecibels);
			}
		}
	}

	stop() {
		if (!this.playing) {
			return;
		}
		this.playing = false;
		this.scheme.then(({ stop }) => stop());
		this.data.fill(this.minDecibels);
	}

	play() {
		if (this.playing) {
			return;
		}
		this.playing = true;
		this.playStart = Date.now() / 1000;
		if (this.scheme == null) {
			const audioContext = new AudioContext();
			this.analyser = audioContext.createAnalyser();
			this.analyser.fftSize = this.binCount * 2;
			this.analyser.minDecibels = this.minDecibels;
			this.analyser.maxDecibels = this.maxDecibels;
			this.analyser.smoothingTimeConstant = 0.85;
			this.analyser.connect(audioContext.destination);
			this.scheme = (async () => {
				try {
					return await fromMediaElement(audioContext, this.analyser, this.path);
				} catch (e) {
					return await fromBuffer(audioContext, this.analyser, this.path);
				}
			})();
		}
		this.scheme.then(({ play }) => play());
	}
}
