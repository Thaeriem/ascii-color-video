import * as vscode from "vscode";
import { default as AnsiUp } from 'ansi_up';
import * as fs from 'fs';


export function activate(context: vscode.ExtensionContext) {
    console.log("Extension activated");
    const extensionPath = vscode.extensions.getExtension('Thaeriem.art2ascii')?.extensionPath;
    const config = vscode.workspace.getConfiguration();
    config.update("art2ascii.gifUri", extensionPath + "/output.data", 
    vscode.ConfigurationTarget.Global);
    const provider = new CustomSidebarViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CustomSidebarViewProvider.viewType,
            provider
        )
    );

    fs.watch(extensionPath + "/output.data", (eventType, filename) => {
        if (eventType === 'change') {
          console.log(`File ${filename} has been updated`);
          provider.stopInterval().then(() => {provider.startInterval()});
        }
      });

    let uploadArt = vscode.commands.registerCommand(
        "art2ascii.upload-art",
        async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectFiles: true,
                canSelectMany: false,
                openLabel: "Open",
                filters: {
                    "Selectable": ["gif", "png", "jpg", "jpeg"]
                }
            };
    
            vscode.window.showOpenDialog(options).then(fileUri => {
                if (fileUri == undefined) 
                    vscode.window.showInformationMessage("No file selected");
                else {
                    if (fileUri && fileUri.length > 0) {
                        const selectedGifPath = fileUri[0].fsPath;
                        vscode.workspace.getConfiguration()
                        .update("art2ascii.gifPath", selectedGifPath, 
                        vscode.ConfigurationTarget.Global);
                    }
                }
            });
            try {
                await vscode.commands.executeCommand('art2ascii.terminal');
            } catch (error) {
                vscode.window.showErrorMessage("Issue with rendering image.");
            }

    });

    context.subscriptions.push(uploadArt);

    let terminal = vscode.commands.registerCommand(
        "art2ascii.terminal",
        async () => {
            if (!extensionPath) {
                vscode.window.showErrorMessage('Failed to retrieve extension directory path.');
                return;
            }

            var gifPath: string | undefined = config.get<string>('art2ascii.gifPath');
            if (gifPath == undefined) 
                gifPath = "";
            const options: vscode.TerminalOptions = {
                hideFromUser: true,
                name: "Ext Term",
            }
            const terminal = vscode.window.createTerminal(options);

            const predeterminedCommand = 'art2ascii -f ' + gifPath + ' -w 35 -e -o ' + extensionPath; 
            terminal.sendText(predeterminedCommand);
    });
    
    context.subscriptions.push(terminal);
}

class CustomSidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "art2ascii.artView";
    private _view?: vscode.WebviewView;
    private _intervalId?: NodeJS.Timeout;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        this.updateWebviewContent();
    }

    public async stopInterval() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = undefined;
        }
    }

    public startInterval() {
        this.updateWebviewContent();
    }

    private async updateWebviewContent(): Promise<void> {

        const frames = await this.getFrames("output.data");
        let currentIndex = 0;
        const interval = setInterval(() => {

            this._view!.webview.html = frames[currentIndex];
            // Move to next frame
            currentIndex = (currentIndex + 1) % frames.length;
        }, 83);
        this._intervalId = interval;

    }

    private async getFrames(filename: string): Promise<string[]> {
        const output = await this.readFileAsDataUri(filename);
        const ansi_up = new AnsiUp();
        let frames = output.split('@FRAME@').map(frame => {
            // Convert each frame to HTML
            const html = ansi_up.ansi_to_html(frame);
            // Wrap HTML content with dark grey background style
            const darkGreyBackgroundStyle = `<style>body { background-color: #333; }</style>`;
            return `<pre>${darkGreyBackgroundStyle}${html}</pre>`;
        });
        frames.shift();
        frames.pop();
        return frames;
    }

    private async readFileAsDataUri(filename: string): Promise<string> {
        try {
            const fileUri = vscode.Uri.joinPath(this._extensionUri, filename);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const contentString = Buffer.from(fileContent).toString('utf-8');
            return contentString;
        } catch (error) {
            console.error(`Error reading file ${filename}: ${error}`);
            return '';
        }
    }
}

export function deactivate() {}