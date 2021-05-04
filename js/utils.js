const coarse = (value, granularity = 1000) => Math.round(value * granularity) / granularity;

export { coarse };
