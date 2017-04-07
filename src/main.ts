/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext, workspace, window, Disposable, commands, Uri } from 'vscode';
import { findHg, Hg } from './hg';
import { Model } from './model';
import { MercurialSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { StatusBarCommands } from './statusbar';
import { HgContentProvider } from './contentProvider';
import { AutoIncoming } from './autofetch';
import { MergeDecorator } from './merge';
import { Askpass } from './askpass';
import TelemetryReporter from 'vscode-extension-telemetry';
import * as nls from 'vscode-nls';

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();

async function init(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
	const { name, version, aiKey } = require(context.asAbsolutePath('./package.json')) as { name: string, version: string, aiKey: string };
	const telemetryReporter: TelemetryReporter = new TelemetryReporter(name, version, aiKey);
	disposables.push(telemetryReporter);

	const outputChannel = window.createOutputChannel('Hg');
	disposables.push(outputChannel);

	const config = workspace.getConfiguration('hg');
	const enabled = config.get<boolean>('enabled') === true;
	const workspaceRootPath = workspace.rootPath;

	const pathHint = workspace.getConfiguration('hg').get<string>('path');
	const info = await findHg(pathHint);
	const askpass = new Askpass();
	const env = await askpass.getEnv();
	const hg = new Hg({ hgPath: info.path, version: info.version, env });

	if (!workspaceRootPath || !enabled) {
		const commandCenter = new CommandCenter(hg, undefined, outputChannel, telemetryReporter);
		disposables.push(commandCenter);
		return;
	}

	const model = new Model(hg, workspaceRootPath);

	outputChannel.appendLine(localize('using hg', "Using hg {0} from {1}", info.version, info.path));
	hg.onOutput(str => outputChannel.append(str), null, disposables);

	const commandCenter = new CommandCenter(hg, model, outputChannel, telemetryReporter);
	const statusBarCommands = new StatusBarCommands(model);
	const provider = new MercurialSCMProvider(model, commandCenter, statusBarCommands);
	const contentProvider = new HgContentProvider(model);
	const autoFetcher = new AutoIncoming(model);
	const mergeDecorator = new MergeDecorator(model);

	disposables.push(
		commandCenter,
		provider,
		contentProvider,
		autoFetcher,
		mergeDecorator,
		model
	);

	if (/^[01]/.test(info.version)) {
		const update = localize('updateHg', "Update Hg");
		const choice = await window.showWarningMessage(localize('hg20', "You seem to have hg {0} installed. Code works best with hg >= 2", info.version), update);

		if (choice === update) {
			commands.executeCommand('vscode.open', Uri.parse('https://mercurial-scm.org/'));
		}
	}
}

export function activate(context: ExtensionContext): any {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	init(context, disposables)
		.catch(err => console.error(err));
}