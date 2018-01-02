import vscode = require('vscode');
import cassandra = require('cassandra-driver');
import resultDocProvider = require('./cqlResultDocumentProvider');
import * as uuid from 'uuid';
import * as util from 'util';
import { stringify } from 'querystring';

export let currentResults = {};
let outputChannel = vscode.window.createOutputChannel(`CQL Output`);

export function registerExecuteCommand() : vscode.Disposable {
    return vscode.commands.registerCommand('cql.execute', ()=> {
        var statements = "";
        if (vscode.window.activeTextEditor.selection.isEmpty) {
            statements = vscode.window.activeTextEditor.document.getText();
        }
        else {
            var selection = vscode.window.activeTextEditor.selection;
            statements = vscode.window.activeTextEditor.document.getText(new vscode.Range(selection.start, selection.end));
        }

        var clearedStatements = statements.replace(/(\n|\r)/gm,"\r\n")
        .split("\r\n").filter(statementString => statementString != "")
        .filter(statementString => !statementString.startsWith("//"));
        
        clearedStatements.forEach(statement => executeCqlStatement(statement));
    });
}

export function executeCqlStatement(statement: string) {
    console.log('Configuring cql statement execution.');

    let cassandraAddress = vscode.workspace.getConfiguration("cql")["address"];
    let cassandraPort = vscode.workspace.getConfiguration("cql")["port"];
    let cassandraConnectionOptions = vscode.workspace.getConfiguration("cql")["connection"];

    let clientOptions = !!cassandraConnectionOptions 
        ? cassandraConnectionOptions 
        : {
            contactPoints: [cassandraAddress],
            hosts: [cassandraAddress]
        };
    
    console.log('Cassandra connection configuration', clientOptions);
    
    let client = new cassandra.Client(clientOptions);

    console.log("statement: " + statement);
    outputChannel.show();
    outputChannel.appendLine(`Executing statement:"${statement}" against Cassandra @  + ${cassandraAddress}:${cassandraPort}`);

    client.connect((err, result) => {
        client.execute(statement.toString(), [], { prepare: true }, function (err, result) {
            console.log('executed', err, result);
            if(err) {
                currentResults = err;
                outputChannel.appendLine(`Error executing statement: ${util.inspect(err)}`)
            } else {
                currentResults = result;
                outputChannel.appendLine(`Execution successful.`)
            }
            showResults(err, result);
        });
    });    
}

export function registerResultDocumentProvider() : vscode.Disposable {
    let provider = new resultDocProvider.cqlResultDocumentProvider();
    return vscode.workspace.registerTextDocumentContentProvider('cql-result', provider);
}

export function registerAll() : vscode.Disposable[] { //I like that.. I may keep this.
    return [registerExecuteCommand(), registerResultDocumentProvider()];
}

function showResults(error, results) {
    if(vscode.workspace.getConfiguration("cql")["resultStyle"].location == "output") {
        outputChannel.appendLine("Results:");
        outputChannel.appendLine(util.inspect(error ? error : currentResults, {depth: 64}));
        outputChannel.appendLine(new Date().toTimeString());
        outputChannel.show();
    } else {
        var isResultBased = vscode.workspace.getConfiguration("cql")['resultStyle'].resultBased;
        if(isResultBased)
        {
            var hasReturnedRows = false;
            if (results.rowLength > 0)
            {
                hasReturnedRows = true;
            }
        }
        if(hasReturnedRows)
        {
            let resultUri = `cql-result://api/results${uuid.v4()}?error=${!!error}`;
            vscode.commands.executeCommand('vscode.previewHtml', resultUri, vscode.ViewColumn.Two, 'Cassandra Execution Results')
                .then((success) => {
                    //do nothing it worked already...
                }, (reason) => {
                    vscode.window.showErrorMessage(reason);
                });
        }
    }
}