import {config} from './src/config.mjs';
import {validateConfig, calculate, summary} from './src/quote.mjs';
validateConfig(config);
console.log(summary(config, calculate(config, config.defaults)));
