/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname */
/* jshint esversion: 6 */

class Files {

	constructor() {

		this.fs = require('fs');
		this.stream = require('stream');
		this.path = require('path');
	}

	readFile(fileName, successHandler, errorHandler, customData) {

		this.fs.readFile(fileName, "utf-8", (err, data) => {

			if (err) {
				errorHandler(fileName, err, customData);
			} else {
				successHandler(fileName, data, customData);
			}
		});
	}

	readFileP(fileName) {

		console.log("readFileP: " + fileName);
		return new Promise((resolve, reject) => {

			console.log("readFileP1");
			this.fs.readFile(fileName, "utf-8", (err, data) => {

				console.log("readFileP2");
				if (!err) {
					resolve(data);
				} else {
					reject(err);
				}
			});
		});
	}

	readFileWithP(fldPath, successHandler, errorHandler) {

		console.log("readFileWithP: " + fldPath);

		const p = this.readFileP(fldPath);
		p.then((data) => {

				console.log("readFileWithP ok: " + fldPath);
				console.log(data);
				successHandler(data);
			})
			.catch((err) => {

				console.log("readFileWithP err: " + fldPath);
				console.log(err);
				errorHandler(err);
			});
	}

	readFileAsWithP(fldPath, successHandler, errorHandler) {
		return new Promise((resolve, reject) => {
			this.fs.readFile(fldPath, (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}

	writeFile(fileName, content, successHandler, errorHandler) {

		this.fs.writeFile(fileName, JSON.stringify(content), {
			encoding: "utf-8"
		}, (err) => {

			if (err) {
				errorHandler(fileName, err);
			} else {
				successHandler(fileName);
			}
		});
	}

	writeFileAsIs(fileName, content, successHandler, errorHandler) {

		this.fs.writeFile(fileName, content, (err) => {

			if (err) {
				errorHandler(fileName, err);
			} else {
				successHandler(fileName);
			}
		});
	}

	writeFileP(fileName, content) {

		return new Promise((resolve, reject) => {

			this.fs.writeFile(fileName, JSON.stringify(content), {
				encoding: "utf-8"
			}, (err) => {

				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	writeFileWithP(fldPath, content, successHandler, errorHandler) {

		console.log("writeFileWithP: " + fldPath);

		const p = this.writeFileP(fldPath, content);
		p.then(() => {

				console.log("writeFileWithP ok: " + fldPath);
				successHandler();
			})
			.catch((err) => {

				console.log("writeFileWithP err: " + fldPath);
				console.log(err);
				errorHandler(err);
			});
	}

	writeFileAsIsP(fileName, content) {

		return new Promise((resolve, reject) => {
			this.fs.writeFile(fileName, content, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	accessFile(filePath, successHandler, errorHandler, customData) {

		this.fs.access(filePath, this.fs.constants.R_OK, (err) => {

			if (err) {
				errorHandler(filePath, err, customData);
			} else {
				successHandler(filePath, customData);
			}
		});
	}

	statFile(filePath, successHandler, errorHandler, customData) {

		this.fs.stat(filePath, function (err, info) {

			if (err) {
				errorHandler(filePath, err, customData);
			} else {
				successHandler(filePath, info, customData);
			}
		});
	}

	createFolder(path, successHandler, errorHandler) {

		console.log("mkdir: " + path);
		this.fs.mkdir(path, (err) => {

			if (!err) {
				// path created
				successHandler(path);
			} else {
				errorHandler(path, err);
			}
		});
	}

	// Recursion doens't work on this version of NodeJs
	createFolderP(fldPath) {

		console.log("mkdirP: " + fldPath);
		return new Promise((resolve, reject) => {

			this.fs.mkdir(fldPath, {
				recursive: true
			}, (err) => {

				if (err) {
					console.log("mkdirP: err ");
					console.log(err);
					reject(err);
				} else {
					console.log("mkdirP: resolve ");
					resolve(fldPath);
				}
			});
		});
	}

	createFolderRecursive(fldPath, successHandler, errorHandler, root = []) {

		console.log("createFolderRecursive: " + fldPath);
		console.log(root);

		const p = this.createFolderP(fldPath);
		p.then((path) => {

				console.log("createFolderRecursive ok: " + path);
				console.log(fldPath);
				if (root.length === 0) {

					successHandler(fldPath);
				} else {
					// Retry child
					console.log("createFolderRecursive retry ");
					console.log(root);
					const path = root.pop();
					this.createFolderRecursive(path, successHandler, errorHandler, root);
				}
			})
			.catch((err) => {

				console.log("createFolderRecursive err: " + fldPath);
				console.log(err);
				if (err.code === 'ENOENT') {

					// Create parent
					const parent = this.path.dirname(fldPath);
					console.log("createFolderRecursive parent: " + parent);
					root.push(fldPath);
					this.createFolderRecursive(parent, successHandler, errorHandler, root);
				} else if (err.code === 'EEXIST') {

					console.log("createFolderRecursive exists: " + fldPath);
					console.log(root);
					if (root.length === 0) {

						successHandler(fldPath);
					} else {

						console.log("createFolderRecursive root NOT empty!");
						errorHandler(fldPath, err);
					}
				} else {
					console.log("createFolderRecursive err");
					errorHandler(fldPath, err);
				}

			});
	}

	fileStats(filePath, successHandler, errorHandler) {

		this.fs.stat(filePath, (err, stats) => {

			if (!err) {
				successHandler(filePath, stats);
			} else {
				errorHandler(filePath, err);
			}
		});
	}

	fileRemove(filePath, successHandler, errorHandler) {

		this.fs.unlink(filePath, (err) => {
			if (err) {
				errorHandler(filePath, err);
			} else {
				successHandler(filePath);
			}
		});

	}

	createStream(toWrite, filePath, options) {

		if (toWrite) {
			return this.fs.createWriteStream(filePath, options);
		}
	}

	// filePath, base64, id, procType
	writeFileFromStream(params, onFinishHandler) {

		const writeStream = this.fs.createWriteStream(params.filePath);
		writeStream.write(params.base64, 'base64');

		// the finish event is emitted when all data has been flushed from the stream
		writeStream.on('finish', () => {
			onFinishHandler(params); // baseId, procType, filePath
		});

		// close the stream
		writeStream.end();
	}

	writeFileFromStreamP(params) {

		return new Promise((resolve, reject) => {
			this.writeFileFromStream(params, () => {
				resolve();
			});
		});
	}

	writeFileFromStreamAsIs(params, onFinishHandler) {

		const writeStream = this.fs.createWriteStream(params.filePath);
		console.log(params.content.length);
		const size = 2500;
		if (params.content.length > size) {
			let idx = 0;
			while (idx < params.content.length) {
				const len = Math.min(size, params.content.length - idx);
				writeStream.write(params.content.substring(idx, idx + len));
				idx += len;
			}
		} else {
			writeStream.write(params.content);
		}

		// the finish event is emitted when all data has been flushed from the stream
		writeStream.on('finish', () => {
			onFinishHandler(params);
		});

		// close the stream
		writeStream.end();
	}

	writeFileFromStreamAsIsP(params) {

		return new Promise((resolve, reject) => {
			this.writeFileFromStreamAsIs(params, () => {
				resolve();
			});
		});
	}

	readDir(fldPath, successHandler, errorHandler) {

		this.fs.readdir(fldPath, (err, items) => {

			if (err) {
				errorHandler(fldPath, err);
			} else {
				successHandler(fldPath, items);
			}
		});
	}

	readDirSync(fldPath) {

		const dirContent = this.fs.readdirSync(fldPath);
		return dirContent;
	}

	getDirNameFromFileName(fileName) {
		return this.path.basename(this.path.dirname(fileName));
	}

	copyFile(source, target, callback) {

		console.log("copy File", source, target);

		// var cbCalled = false;
		var rd = this.fs.createReadStream(source);
		rd.on("error", (err) => {
			callback(target, err);
		});

		var wr = this.fs.createWriteStream(target);
		wr.on("error", (err) => {
			callback(target, err);
		});

		wr.on("close", (ex) => {
			callback(target, null);
		});

		rd.pipe(wr);
	}

	copyFileP(srcFile, trgFile) {

		var readFile = this.fs.createReadStream(srcFile);
		var writeFile = this.fs.createWriteStream(trgFile);

		try {
			return new Promise((resolve, reject) => {
				readFile.on('error', reject);
				writeFile.on('error', reject);
				writeFile.on('finish', resolve);
				readFile.pipe(writeFile);
			});
		} catch (error) {
			readFile.destroy();
			writeFile.end();
			throw error;
		}
	}

	clearFolder(pathFld, rmvFld = true) {
		console.log("get files from clear fld " + pathFld);
		this.fs.readdir(pathFld, (err, files) => {

			console.log("get files from clear fld in");
			console.log(err);
			if (err) {
				console.log('failed to get files');
			} else {
				console.log("get files from clear fld enum");
				if (files.length) {
					for (const file of files) {

						const fileOrFld = this.path.join(pathFld, file);
						this.fs.stat(fileOrFld, (err, stat) => {

							console.log("get files from clear fld stat " + fileOrFld);
							if (err) {
								console.log('failed to get stat ' + fileOrFld);
							} else {
								if (stat.isDirectory()) {
									this.clearFolder(fileOrFld);
								} else {
									console.log("get files from clear fld file");
									this.fs.unlink(fileOrFld, (err) => {

										if (err) {
											console.log("failed to delete from clear fld " + fileOrFld);
										}
									});
								}
							}
						});
					}
					this.clearFolder(pathFld, rmvFld);
				} else if (rmvFld) {
					console.log('get files rm fld');
					this.fs.rmdir(pathFld, (err) => {
						console.log('get files rm dir');
						console.log(err);
						if (err) {
							console.log('failed to delete fld ' + pathFld);
						}
					});
				}
			}
		});
	}

	renameFile(filePath, newName, appendOrReplace) {

		console.log("renameFile path: " + filePath);
		console.log("renameFile name: " + newName);

		let newPath = '';
		const root = this.path.dirname(filePath);
		if (appendOrReplace === false) { // replace
			newPath = this.path.join(root, newName);
		} else { // append
			const pExt = filePath.lastIndexOf('.');
			if (pExt !== -1) {
				newPath = filePath.substring(0, pExt);
				newPath += newName;
				newPath += filePath.substring(pExt, filePath.length);
			} else {
				console.log("renameFile failed to find extension: ");
				newPath = filePath + newName;
			}
		}
		console.log("renameFile npath: " + newPath);

		return new Promise((resolve, reject) => {

			this.fs.rename(filePath, newPath, (err) => {

				if (err) {
					console.log("rename: err ");
					console.log(err);
					reject(filePath, err);
				} else {
					console.log("rename: resolve ");
					resolve(filePath, newPath);
				}
			});
		});
	}

	copyFolderSync(from, to) {
		if (!this.fs.existsSync(to)) this.fs.mkdirSync(to);
		this.fs.readdirSync(from).forEach(element => {
			if (this.fs.lstatSync(this.path.join(from, element)).isFile()) {
				this.fs.copyFileSync(this.path.join(from, element), this.path.join(to, element));
			} else {
				this.copyFolderSync(this.path.join(from, element), this.path.join(to, element));
			}
		});
	}

	getDirName(fld) {
		return this.path.dirname(fld);
	}

	resolveName(fld, file) {
		return this.path.resolve(fld, file);
	}

	isFolder(path) {
		const stat = this.fs.statSync(path);
		return (stat && stat.isDirectory());
	}

	readFileSync(path) {
		return this.fs.readFileSync(path);
	}

	relativePath(fld, file) {
		return this.path.relative(fld, file);
	}
}

module.exports = Files;