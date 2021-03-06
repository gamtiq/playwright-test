/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('merge-options');
const delay = require('delay');
const resolveCwd = require('resolve-cwd');
const Runner = require('./runner');
const { addWorker } = require('./utils');

const runMocha = () => `
mocha
  .run((f) =>{
    self.pwTestController.end(f > 0)
  })
`;

const runMochaWorker = () => `
mocha
  .run((f)=>{
    postMessage({
        "pwRunEnded": true,
        "pwRunFailed": f > 0
    })
  })
`;

class MochaRunner extends Runner {
    constructor(options = {}) {
        super(merge({
            runnerOptions: {
                allowUncaught: false,
                bail: true,
                reporter: 'spec',
                timeout: 5000,
                color: true,
                ui: 'bdd'
            }
        }, options));
    }

    async runTests() {
        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

                await this.page.evaluate(runMocha());
                break;
            }
            case 'worker': {
                await this.page.evaluate(addWorker(this.file));
                const run = new Promise((resolve) => {
                    this.page.on('workercreated', async (worker) => {
                        await delay(1000);
                        await worker.evaluate(runMochaWorker());
                        resolve();
                    });
                });

                await run;
                break;
            }
            default:
                console.error('mode not supported');
                break;
        }
    }

    compiler() {
        const compiler = webpack({
            mode: 'development',
            output: {
                path: this.dir,
                filename: 'bundle.[hash].js',
                devtoolModuleFilenameTemplate: info =>
                    'file:///' + encodeURI(info.absoluteResourcePath)
            },
            entry: [
                require.resolve('./setup-mocha.js'),
                ...this.options.files
            ],
            resolve: { alias: { 'mocha/mocha': resolveCwd('mocha/mocha.js') } },
            node: {
                'dgram': 'empty',
                'fs': 'empty',
                'net': 'empty',
                'tls': 'empty',
                'child_process': 'empty',
                'console': false,
                'global': true,
                'process': true,
                '__filename': 'mock',
                '__dirname': 'mock',
                'Buffer': true,
                'setImmediate': true
            },
            plugins: [
                new webpack.DefinePlugin({ 'process.env': JSON.stringify(this.env) })
            ]

        });

        return compiler;
    }
}

module.exports = MochaRunner;
