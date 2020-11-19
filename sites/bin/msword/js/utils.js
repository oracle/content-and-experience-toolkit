/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname */
/* jshint esversion: 6 */

const nodejsPath = require('path');
const nodejsProcess = require('process');
const nodejsOs = require('os');
const nodejsFs = require('fs');

class Utils {

	constructor() {}

	static appendToPath(fldPath, name) {
		// return fldPath + "/" + name;
		if (fldPath == null || name == null) {
			console.log("appendToPath " + fldPath + " name " + name);
			return null;
		}
		return nodejsPath.join(fldPath, name);
	}

	static generateSignature() {
		const str = CONSTANTS.SYS_FLD + Utils.hashCode(CONSTANTS.SHARED_FLD);
		return str;
	}

	static hasSignatureFromPath(fldPath) {
		return (fldPath.indexOf(Utils.generateSignature()) === 0);
	}

	// names: list of names
	static appendToPathArray(fldPath, names) {

		// console.log("appendToPathArray"+ fldPath);
		fldPath = nodejsPath.join(fldPath, names.join(nodejsPath.sep));
		// console.log(fldPath);
		return fldPath;
	}

	static hashCode(str) {
		if (str.length > 0) {
			return str.split('').reduce((prevHash, currVal) =>
				((prevHash << 5) - prevHash) + currVal.charCodeAt(0), 0);
		}
		console.log("Empty string in hash");
		return "";
	}

	static generateFldNameFromSrvUidInfo(url, uid) {

		console.log("uid:" + uid);
		let str = Utils.generateFldNameFromSrvInfo(url);
		str += CONSTANTS.UID_FLD;
		str += uid;
		return this.validateFldName(str);
	}

	static generateFldNameFromSrvInfo(url) {
		console.log("url:" + url);

		let str = Utils.generateSignature();
		str += CONSTANTS.SRV_FLD;
		str += Utils.hashCode(url).toString();
		return Utils.validateFldName(str);
	}

	static generateFldNameFromSrvRepo(url, repoId) {
		console.log("repo url:" + url + " - " + repoId);

		const str = Utils.appendToPath(Utils.generateFldNameFromSrvInfo(url), CONSTANTS.REP_FLD + repoId);
		console.log("repo url:" + str);
		return str;
	}

	static validateFldName(str) {
		return str.split(/[^a-zA-Z0-9\-_.]/gi).join('_');
	}

	static replaceAll(strSrcDst, strSearch, strReplace) {
		let strTmp = "";
		if (strSrcDst == null) return strTmp;

		do {
			strTmp = strSrcDst.replace(strSearch, strReplace);
			if (strTmp === strSrcDst) break;
			if (strTmp.length === 0) break;
			strSrcDst = strTmp;
		}
		while (true);

		return strSrcDst;
		//        return strAll.replace(/strSearch/g, strReplace);
	}

	static makeFilePathPortable(_filePath, isLink) {
		let filePath = Utils.replaceAll(_filePath, "\\", "/");
		console.log("filepath reaplces: " + filePath);
		if (isLink === true) {
			// USe the symlink to make it portable
			const appName = CONSTANTS.SHARED_FLD;
			const sPos = filePath.indexOf(appName);
			if (sPos !== -1) {
				const shPath = filePath.substring(sPos + appName.length, filePath.length);
				filePath = "~/" + encodeURIComponent(CONSTANTS.SHARED_FLD) + shPath;
				console.log("filepath symlink: " + filePath);
			}
		}
		return filePath;
	}

	static getMimeTypeFromDocFormatType(_dDocFormatType, _dExtension) {
		let mimeType = "";

		console.log("getMimeTypeFromDocFormatType fmt: " + _dDocFormatType + " ext: " + _dExtension);
		const dExtension = _dExtension.toLowerCase();
		if (_dDocFormatType.length === 0) {

			// Is it image?
			mimeType = Utils.getMimeTypeFromKnownType('image', dExtension);
			if (mimeType.length === 0) {

				// Is it audio?
				mimeType = Utils.getMimeTypeFromKnownType('audio', dExtension);
				if (mimeType.length === 0) {

					// Is it video?
					mimeType = Utils.getMimeTypeFromKnownType('video', dExtension);
				}
			}
		} else {
			const dDocFormatType = _dDocFormatType.toLowerCase();
			mimeType = Utils.getMimeTypeFromKnownType(dDocFormatType, _dExtension);
		}

		if (mimeType.length === 0) {
			console.log("getMimeTypeFromDocFormatType failed " + _dDocFormatType + " ext: " + _dExtension);
		} else {
			console.log("getMimeTypeFromDocFormatType mime: " + mimeType);
		}
		return mimeType;
	}

	static getMimeTypeFromKnownType(dDocFormatType, dExtension) {
		let mimeType = "";

		if (dDocFormatType === "image") {
			if (dExtension === "jpg" || dExtension === 'jpeg' || dExtension === 'jpe') {
				mimeType = "image/jpeg";
			} else if (dExtension === "png") {
				mimeType = "image/png";
			} else if (dExtension === "gif") {
				mimeType = "image/gif";
			} else if (dExtension === "tif") {
				mimeType = "image/tiff";
			} else if (dExtension === "bmp") {
				mimeType = "image/bmp";
			}
		} else if (dDocFormatType === "audio") {
			if (dExtension === "aac") {
				mimeType = "audio/aac";
			} else if (dExtension === "mid" || dExtension === "midi") {
				mimeType = "audio/x-midi";
			} else if (dExtension === "ogg" || dExtension === "opus") {
				mimeType = "audio/oggc";
			} else if (dExtension === "wav") {
				mimeType = "audio/wav";
			} else if (dExtension === "weba" || dExtension === "webm") {
				mimeType = "audio/webm";
			} else if (dExtension === "mp4") {
				mimeType = "audio/mp4";
			} else if (dExtension === "m4a") {
				mimeType = "audio/m4a";
			} else if (dExtension === "flac") {
				mimeType = "audio/flac";
			} else if (dExtension === "wma") {
				mimeType = "audio/x-ms-wma";
			} else if (dExtension === "aif" || dExtension === "aifc" || dExtension === "aiff") {
				mimeType = "audio/x-aiff";
			} else if (dExtension === "mp2" || dExtension === "m2a" || dExtension === "mp3") {
				mimeType = "audio/mpeg";
			}
		} else if (dDocFormatType === "video") {
			if (dExtension === "avi") {
				mimeType = "video/avi";
			} else if (dExtension === "m1v" || dExtension === "m2v" || dExtension === "mp2" || dExtension === "mpa" ||
				dExtension === "mpe" || dExtension === "mpeg" || dExtension === "mpg" || dExtension === "mpv2") {
				mimeType = "video/mpeg";
			} else if (dExtension === "m4v") {
				mimeType = "video/mp4";
			} else if (dExtension === "dv") {
				mimeType = "video/x-dv";
			} else if (dExtension === "mov" || dExtension === "mqv" || dExtension === "qt") {
				mimeType = "video/quicktime";
			} else if (dExtension === "wmv") {
				mimeType = "video/x-ms-wmv";
			} else if (dExtension === "asf" || dExtension === "asr" || dExtension === "asx") {
				mimeType = "video/x-ms-asf";
			} else if (dExtension === "lsf" || dExtension === "lsx") {
				mimeType = "video/x-la-asf";
			}
		}
		return mimeType;
	}

	static getSubtypeFromMimeType(mimeType) {
		let type = mimeType;
		const pt = type.indexOf('/'); // Mimetype (image/png)
		if (pt !== -1) type = mimeType.substring(pt + 1, mimeType.length);
		return type;
	}

	static getTypeFromMimeType(mimeType) {
		let type = mimeType;
		const pt = type.indexOf('/'); // Mimetype (image/png)
		if (pt !== -1) type = mimeType.substring(0, pt);
		return type;
	}

	static isImageFromMimeType(mimeType) {
		let isImage = false;
		const sType = Utils.getTypeFromMimeType(mimeType);
		if (sType.length) isImage = (sType.toLowerCase().indexOf('image') !== -1);
		return isImage;
	}

	static getEncodedServerUrlFromPath(fldPath) {
		const sig = Utils.generateSignature();
		if (Utils.hasSignatureFromPath(fldPath)) {

			const srv = CONSTANTS.SRV_FLD;
			const uidPos = fldPath.indexOf(CONSTANTS.UID_FLD);
			if (uidPos !== -1) {

				const value = fldPath.substring(sig.length + srv.length, uidPos);
				return value;
			} else {
				const value = fldPath.substring(sig.length + srv.length, fldPath.length);
				return value;
			}
		}
		return "";
	}

	static getItemIDFromFilePath(file) {
		console.log("Get item from file: " + file);
		if (file.length > 0) {

			console.log("Get item from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("as: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("srvuid: " + srvUid);

					// Check if we have a repo
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					const verPos = file.indexOf("/", idPos + 1);
					console.log("as: " + verPos);

					if (verPos !== -1) {

						const id = file.substring(idPos + 1, verPos);
						console.log("id: " + id);
						return id;
					}
				}
			}
		}

		return null;
	}

	static getItemNameFromFilePath(file) {
		console.log("Get item name from file: " + file);
		if (file.length > 0) {

			console.log("Get item name from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("idpos: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("srvuid: " + srvUid);

					// Check if we have a repo
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					// Version
					const verPos = file.indexOf("/", idPos + 1);
					console.log("verpos: " + verPos);

					if (verPos !== -1) {

						const rPos = file.indexOf("/", verPos + 1);
						console.log("rpos: " + rPos);

						if (rPos !== -1) {

							const strVer = CONSTANTS.VER_FLD;
							const version = file.substring(verPos + 1 + strVer.length, rPos);
							console.log("Get item name ver: " + version);
						}

						let namePos = rPos;

						// Check if we have a rendition
						const rrPos = file.indexOf("/", rPos + 1);
						console.log("rrpos: " + rrPos);
						if (rrPos !== -1 && (file.indexOf(CONSTANTS.RNDS_FLD, rPos) !== -1)) {

							const rendition = file.substring(rPos + 1, rrPos);
							console.log("Get item name rendition fld: " + rendition);

							// Rendition id
							const fPos = file.indexOf("/", rrPos + 1);
							console.log("fpos: " + fPos);
							if (fPos !== -1) {

								const renditionID = file.substring(rrPos + 1, fPos);
								console.log("Get item name rendition id: " + renditionID);
								namePos = fPos;
							}
						}

						console.log("namepos: " + namePos);
						if (namePos !== -1) {

							const name = decodeURIComponent(file.substring(namePos + 1, file.length));
							console.log("name: " + name);
							return name;
						}
					}
				}
			}
		}

		return null;
	}

	static getItemVersionFromFilePath(file) {
		console.log("Get item version from file: " + file);
		if (file.length > 0) {

			console.log("Get item version from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item version from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item version from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("idpos: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("srvuid: " + srvUid);

					// Check if we have a repo
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					// Version
					const verPos = file.indexOf("/", idPos + 1);
					console.log("verpos: " + verPos);

					if (verPos !== -1) {

						const namePos = file.indexOf("/", verPos + 1);
						console.log("namepos: " + namePos);

						if (namePos !== -1) {

							const fld = CONSTANTS.VER_FLD;
							const ver = file.substring(verPos + 1 + fld.length, namePos);
							console.log("Get item version ver: " + ver);
							return ver;
						}
					}
				}
			}
		}

		return null;
	}

	static getItemRenditionIDFromFilePath(file) {
		console.log("Get item rend from file: " + file);
		if (file.length > 0) {

			console.log("Get item rend from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item rend from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item rend from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Rend Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("as: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("Rend srvuid: " + srvUid);

					// Check if we have a repo
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					// Version
					const verPos = file.indexOf("/", idPos + 1);
					console.log("verpos: " + verPos);

					if (verPos !== -1) {

						const rPos = file.indexOf("/", verPos + 1);
						console.log("rpos: " + rPos);

						if (rPos !== -1) {

							const strVer = CONSTANTS.VER_FLD;
							const version = file.substring(verPos + 1 + strVer.length, rPos);
							console.log("Get item rend ver: " + version);
						}

						// Check if it's a rendition
						const rrPos = file.indexOf("/", rPos + 1);
						console.log("rrpos: " + rrPos);
						if (rrPos !== -1 && (file.indexOf(CONSTANTS.RNDS_FLD, rPos) !== -1)) {

							const renditionType = file.substring(rPos + 1 + CONSTANTS.RNDS_FLD.length, rrPos);
							console.log("Get item rend type: " + renditionType);

							const fPos = file.indexOf("/", rrPos + 1);
							console.log("fpos: " + fPos);
							if (fPos !== -1) {

								const rendition = file.substring(rrPos + 1, fPos);
								console.log("Get item rend rendition: " + rendition);
								return rendition;
							}
						}
					}
				}
			}
		}

		return null;
	}

	static getItemRenditionTypeFromFilePath(file) {
		console.log("Get item rend from file: " + file);
		if (file.length > 0) {

			console.log("Get item rend from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item rend from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item rend from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Rend Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("as: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("Rend srvuid: " + srvUid);

					// Check if we have a repo
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					// Version
					const verPos = file.indexOf("/", idPos + 1);
					console.log("verpos: " + verPos);

					if (verPos !== -1) {

						const rPos = file.indexOf("/", verPos + 1);
						console.log("rpos: " + rPos);

						if (rPos !== -1) {

							const strVer = CONSTANTS.VER_FLD;
							const version = file.substring(verPos + 1 + strVer.length, rPos);
							console.log("Get item rend ver: " + version);
						}

						// Check if it's a rendition
						const rrPos = file.indexOf("/", rPos + 1);
						console.log("rrpos: " + rrPos);
						if (rrPos !== -1 && (file.indexOf(CONSTANTS.RNDS_FLD, rPos) !== -1)) {

							const renditionType = file.substring(rPos + 1 + CONSTANTS.RNDS_FLD.length, rrPos);
							console.log("Get item rend type: " + renditionType);

							return renditionType;
						}
					}
				}
			}
		}

		return null;
	}

	static getItemServerFromFilePath(file) {
		console.log("Get item srv from file: " + file);
		if (file.length > 0) {

			console.log("Get item srv from file1: " + file);
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				const idPos = file.indexOf("/", shdPos);
				console.log("as: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("srvuid: " + srvUid);
					return srvUid;
				}
			}
		}

		return null;
	}

	static getItemRepositoryFromFilePath(file) {
		console.log("Get item name from file: " + file);
		if (file.length > 0) {

			console.log("Get item name from file1");
			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("idpos: " + idPos);

				if (idPos !== -1) {

					const srvUid = file.substring(shdPos, idPos);
					console.log("srvuid: " + srvUid);

					// Check if we have a repo
					const rep = CONSTANTS.REP_FLD;
					const repoPos = file.indexOf(rep, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						const repoId = file.substring(repoPos + rep.length, idPos);
						console.log("repo: " + repoId);

						return repoId;
					}
				}
			}
		}

		return null;
	}

	static checkItemFromFilePath(file, srvs) {
		console.log("check item from file: " + file);
		if (file.length > 0) {

			// Check if it's one of ours
			let strWrk = CONSTANTS.SHARED_FLD + "/";
			let wrkspPos = file.indexOf(strWrk);
			console.log("Get item from file2 " + strWrk + " " + wrkspPos);

			if (wrkspPos === -1) {
				strWrk = encodeURIComponent(CONSTANTS.SHARED_FLD) + "/";
				wrkspPos = file.indexOf(strWrk);
				console.log("Get item from file2 " + strWrk + " " + wrkspPos);
			}

			if (wrkspPos !== -1) {

				console.log("Found match: " + wrkspPos);
				// Get the id
				const shdPos = wrkspPos + strWrk.length;
				let idPos = file.indexOf("/", shdPos);
				console.log("as: " + idPos);

				if (idPos !== -1) {

					const srvUidFld = file.substring(shdPos, idPos);
					console.log("checkItemFromFilePath srvuid: " + srvUidFld);

					// Check if we have a repo
					let repoId = '';
					const repoPos = file.indexOf(CONSTANTS.REP_FLD, idPos);
					if (repoPos === idPos + 1) {

						// Next branch is the id
						idPos = file.indexOf("/", repoPos);
						repoId = file.substring(repoPos, idPos);
						console.log("repo: " + repoId);
					}

					const verPos = file.indexOf("/", idPos + 1);
					console.log("as: " + verPos);

					if (verPos !== -1) {

						const id = file.substring(idPos + 1, verPos);
						console.log("checkItemFromFilePath id: " + id);

						let version = "";
						let renditionID = '';
						let renditionType = '';
						const rPos = file.indexOf("/", verPos + 1);
						console.log("as: " + rPos);

						if (rPos !== -1) {

							const strVer = CONSTANTS.VER_FLD;
							version = file.substring(verPos + 1 + strVer.length, rPos);
							console.log("checkItemFromFilePath ver: " + version);
						}

						// Check if it's a rendition
						let fPos = file.indexOf("/", rPos + 1);
						console.log("as: " + fPos);
						if (fPos !== -1 && (file.indexOf(CONSTANTS.RNDS_FLD, rPos) !== -1)) {

							renditionType = file.substring(rPos + 1 + CONSTANTS.RNDS_FLD.length, fPos);
							console.log("checkItemFromFilePath rendition type: " + renditionType);

							const rrPos = file.indexOf("/", fPos + 1);
							console.log("as: " + rrPos);
							if (rrPos !== -1) {

								renditionID = file.substring(fPos + 1, rrPos);
								console.log("checkItemFromFilePath rendition: " + renditionID);
								fPos = rrPos;
							}
						} else {
							// Asset, not a rendition
							fPos = rPos;
						}

						const name = decodeURIComponent(file.substring(fPos + 1, file.length));
						console.log("checkItemFromFilePath name: " + name);

						// Compare w/ the list of subscribed services
						let foundWrksp = null;

						console.log(srvs);
						if (srvs != null && srvs.length) {

							foundWrksp = srvs.find((wrksp) => {
								console.log(wrksp);
								let url = '';
								if (Object.prototype.hasOwnProperty.call(wrksp, 'url')) url = wrksp.url;
								else url = wrksp;
								console.log(url);
								const str = Utils.generateFldNameFromSrvInfo(url);
								console.log(str);
								return (str === srvUidFld);
							});
						}

						if (foundWrksp != null) {
							console.log("check srvUrl: " + foundWrksp.url);
							console.log("check uid: " + foundWrksp.uid);
							console.log("old name: " + name + " oldVer: " + version);

							const item = {
								srvUrl: foundWrksp.url,
								uid: foundWrksp.uid,
								id: id,
								version: version,
								name: name,
								repoId: repoId,
								linkedName: name,
								linkedVersion: version,
								linkedRenditionID: renditionID,
								linkedRenditionType: renditionType,
								renditionID: renditionID,
								renditionType: renditionType,
								resolved: CONSTANTS.ITEM_RESOLVED_ID_UNKNOWN
							};

							console.log("check item from file item1 ");
							console.log(item);
							return (item);
						} else {
							console.log("checkItemFromFilePath could not find in srvs");

							// We are not connected to this service!
							// DoubleCheck if it has the signature
							if (Utils.hasSignatureFromPath(srvUidFld)) {

								const encodedSrvUrl = Utils.getEncodedServerUrlFromPath(srvUidFld);
								const uid = ""; // getUidFromPath(srvUidFld);
								console.log(encodedSrvUrl);
								console.log("old name: " + name + " oldVer: " + version);

								// For now just notify the user 
								const item = {
									srvUrl: encodedSrvUrl,
									uid: uid,
									id: id,
									version: version,
									name: name,
									repoId: repoId,
									linkedName: name,
									linkedVersion: version,
									linkedRenditionID: renditionID,
									linkedRenditionType: renditionType,
									renditionID: renditionID,
									renditionType: renditionType,
									resolved: CONSTANTS.ITEM_RESOLVED_SRVUID_UNKNOWN
								};

								console.log("check item from file item2 ");
								console.log(item);
								return (item);
							}
						}
					}
				}
			}
		}

		return null;
	}

	static getDefaultThumbnail(extensionPath) {
		return Utils.getExtImage(extensionPath, "noFile64.png");
	}

	static getLockImage(extensionPath) {
		return Utils.getExtImage(extensionPath, "padlock.svg");
	}

	static getExtImage(extensionPath, imageName) {
		const name = [CONSTANTS.IMGS_FLD, imageName];
		const fullPath = Utils.appendToPathArray(extensionPath, name);
		return fullPath;
	}

	static getFilmStripImage(extensionPath) {
		return Utils.getExtImage(extensionPath, "film.svg");
	}

	static makeLocalPathFromPortable(isWindows, sysRoot, file) {
		console.log("makeLocalPathFromPortable");
		console.log(file);
		let filePath = Utils.replaceAll(file, "\\", "/");
		console.log("fp1:" + filePath);
		let fileTmp = Utils.replaceAll(filePath, "::", "/");
		filePath = fileTmp;
		console.log("fp2:" + filePath);
		if (isWindows === false) {
			fileTmp = Utils.replaceAll(filePath, ":", "/");
			filePath = fileTmp;
			console.log("fp3:" + filePath);
		} else {
			const ts = filePath.indexOf('/');
			if (ts === 0) {
				fileTmp = filePath.substring(1, filePath.length);
				filePath = fileTmp;
				console.log("fp30:" + filePath);
			}
			const ts1 = filePath.indexOf(':');
			if (ts1 === -1) {
				if (filePath.indexOf('~/') === -1) {
					const fp = filePath.substring(0, 1) + ':' + filePath.substring(1, filePath.length);
					filePath = fp;
					console.log("fp31:" + filePath);
				}
			}
		}
		const tPos = filePath.indexOf('~/');
		if (tPos !== -1) {
			const fp = filePath.substring(tPos, filePath.length);
			filePath = Utils.replaceAll(fp, "~", sysRoot);
			console.log("fp4:" + filePath);
		}
		console.log(filePath);
		return filePath;
	}

	static generateRootFld(path) {
		console.log("generate Path");
		const localData = nodejsProcess.env.LOCALAPPDATA;
		console.log(localData);

		// Build the path from the crt location
		let localPath = path;
		let idx = 4;
		while (idx > 0) {
			localPath = nodejsPath.dirname(localPath);
			idx--;
		}
		console.log(localPath);

		const appPath = localData || localPath;
		console.log(appPath);
		const names = [CONSTANTS.COMPANY_NAME, CONSTANTS.DESKTOP_FLD, CONSTANTS.DESKTOP_CACHE];
		return Utils.appendToPathArray(appPath, names);
	}

	static getThumbnailName() {
		return CONSTANTS.THUMBNAIL_NAME;
	}

	static getThumbnailStripName() {
		return CONSTANTS.THUMBNAIL_STRIP_NAME;
	}

	static extractDataFromServerResults(searchResults, fieldNames) {
		const items = [];

		if (searchResults != null) {

			// Enum all items
			const rows = searchResults.rows;
			rows.forEach((row) => {

				const item = {};
				let pos = 0;

				searchResults.fields.forEach((field) => {

					if ((fieldNames.length === 0) ||
						(fieldNames.find((fn) => {
							return fn === field.name;
						}) != null)) {

						const key = field.name;
						const val = row[pos];
						console.log("key: " + key + " value: " + val);
						const keyVal = {
							key: val
						};
						console.log(keyVal);
						item[key] = val;
						console.log(item);
					}
					pos++;
				});

				items.push(item);
			});
		} else {
			console.log("Search results empty");
		}

		return items;
	}

	static base64toBlob(base64Data, contentType, sliceSize) {
		contentType = contentType || '';

		const byteCharacters = atob(base64Data);

		// Get blob data sliced or not
		const blobData = sliceSize ? Utils.getBlobDataSliced(byteCharacters) : Utils.getBlobDataAtOnce(byteCharacters);

		const blob = new Blob(blobData, {
			type: contentType
		});

		return blob;
	}

	static getBlobDataAtOnce(byteCharacters) {
		const byteNumbers = new Array(byteCharacters.length);

		for (var i = 0; i < byteCharacters.length; i++) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}

		const byteArray = new Uint8Array(byteNumbers);

		return [byteArray];
	}

	static getBlobDataSliced(byteCharacters) {
		var slice;
		var byteArrays = [];
		var sliceSize = 1024 * 1024;

		for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
			slice = byteCharacters.slice(offset, offset + sliceSize);

			const byteNumbers = new Array(slice.length);

			for (var i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}

			const byteArray = new Uint8Array(byteNumbers);

			// Add slice
			byteArrays.push(byteArray);
		}

		return byteArrays;
	}

	/**
	 * https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
	 */
	static generateUUID() {

		var d = new Date().getTime();
		if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
			d += performance.now(); // use high-precision timer if available
		}

		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			var r = (d + Math.random() * 16) % 16 | 0;
			d = Math.floor(d / 16);
			return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
		});
	}

	static getDeviceName(uid) {
		const str = Utils.hashCode(uid).toString();
		return Utils.validateFldName(str);
	}

	static getItemStringSize(text, font) {
		// re-use canvas object for better performance
		var canvas = Utils.getItemStringSize.canvas || (this.getItemStringSize.canvas = document.createElement("canvas"));
		var context = canvas.getContext("2d");
		context.font = font;
		var metrics = context.measureText(text);
		return Math.ceil(metrics.width);
	}

	static fileSize(bytes) {
		if (bytes === 0) {
			return "0 B";
		}
		var e = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, e)).toFixed(0) + ' ' + ' KMGTP'.charAt(e) + 'B';
	}

	static getHomeDir() {
		return nodejsOs.homedir();
	}

	static getTmpDir() {
		// On the mac the tmp file is returned as a link
		return Utils.appendToPath(nodejsFs.realpathSync(nodejsOs.tmpdir()), CONSTANTS.EXTENSION_MAIN);
	}

	static getAssetFieldNames(repoID) {

		const fieldNames = [];
		if (repoID == null) {
			fieldNames.push("fItemGUID");
			fieldNames.push("fItemName");
			fieldNames.push("fItemType");
			fieldNames.push("fParentGUID");
			fieldNames.push("fLastModifiedDate");
			fieldNames.push("fLastModifierFullName");
			fieldNames.push("fCreateDate");
			fieldNames.push("fCreatorFullName");
			fieldNames.push("dExtension");
			fieldNames.push("dDocFormatType");
			fieldNames.push("dFileSize");
			fieldNames.push("dRevLabel");
			fieldNames.push("xApprovalState");
			fieldNames.push("xPublishedVersion");
		} else {
			fieldNames.push("fItemGUID");
			fieldNames.push("fItemName");
			fieldNames.push("dExtension");
			fieldNames.push("dFileSize");
			fieldNames.push("fApplication");
			fieldNames.push("dRevLabel");
			fieldNames.push("dAssetFormatType");
			fieldNames.push("fFileDescription");
			fieldNames.push("fLastModifiedDate");
			fieldNames.push("fLastModifierFullName");
			fieldNames.push("fCreateDate");
			fieldNames.push("fCreatorFullName");
			fieldNames.push("xARApprovalStatus");
			fieldNames.push("xARTags");
			fieldNames.push("xARLanguageValue");
			fieldNames.push("xARCollections");
			fieldNames.push("xARTargetedChannels");
			fieldNames.push("xARPublishedChannels");
			fieldNames.push("xARIsPublished");
			fieldNames.push("xARIsLatestPublished");
			fieldNames.push("xARPublishedVersion");
			fieldNames.push("xARCaaSGUID");
		}
		return fieldNames;
	}

	static loadCtrlThemeImage(root, lightTheme, ctrlId, srcImage, srcImageLight) {
		const fullPath = Utils.getThemeImagePath(root, lightTheme, srcImage, srcImageLight);
		if (fullPath.length) $(ctrlId).find('img').attr('src', fullPath);
	}

	static getThemeImagePath(root, lightTheme, srcImage, srcImageLight) {
		const name = [CONSTANTS.IMGS_FLD];

		if (!srcImage.length || !srcImageLight.length) return '';
		if (lightTheme) name.push(srcImageLight);
		else name.push(srcImage);

		const fullPath = Utils.appendToPathArray(root, name);
		return fullPath;
	}

	static getKeyCode(_key) {
		let code = 0;

		const key = _key.toLowerCase();
		if (key === 'backspace') {
			code = 8;
		} else if (key === 'tab') {
			code = 9;
		} else if (key === 'enter') {
			code = 13;
		} else if (key === 'escape') {
			code = 27;
		} else if (key === 'space') {
			code = 32;
		} else if (key === 'arrowleft') {
			code = 37;
		} else if (key === 'arrowup') {
			code = 38;
		} else if (key === 'arrowright') {
			code = 39;
		} else if (key === 'arrowdown') {
			code = 40;
		} else if (key === 'delete') {
			code = 46;
		} else if (key === 'menu') {
			code = 93;
		} else if (key === 'cancel') {
			code = 67;
		}

		console.log('getKeyCode ' + _key + ' key: ' + key + ' code: ' + code);
		return code;
	}

	static getVirtualKeyCode(_key, isWin) {

		if (isWin) {
			return Utils.getKeyCode(_key);
		}

		let code = 0;

		const key = _key.toLowerCase();
		if (key === 'backspace') {
			code = 51; //
		} else if (key === 'tab') {
			code = 48; //
		} else if (key === 'enter') {
			code = 36; //
		} else if (key === 'escape') {
			code = 53;
		} else if (key === 'space') {
			code = 49; //
		} else if (key === 'arrowleft') {
			code = 123;
		} else if (key === 'arrowup') {
			code = 126;
		} else if (key === 'arrowright') {
			code = 124;
		} else if (key === 'arrowdown') {
			code = 125;
		} else if (key === 'delete') {
			code = 51;
		} else if (key === 'menu') {
			code = 93;
		} else if (key === 'cancel') {
			code = 8;
		}

		console.log('getVirtualKeyCode ' + _key + ' key: ' + key + ' code: ' + code);
		return code;
	}

	static getVersion(version) {
		return CONSTANTS.VER_FLD + version;
	}

	static getFileExtension(fullName) {

		let ext = '';
		if (fullName != null && fullName.length > 0) {
			const fPos = fullName.lastIndexOf(".");
			if (fPos !== -1) {

				ext = fullName.substring(fPos + 1, fullName.length);
			}
		}
		return ext;
	}

	static getOccurrenceCount(str, subStr, allowOverlapping = true) {
		let count = 0;
		if (str.length && subStr.length) {
			let pos = 0;
			while (pos !== -1) {
				pos = str.indexOf(subStr, pos);
				if (pos !== -1) {
					++count;
					pos += (allowOverlapping ? 1 : subStr.length);
				}
			}
		}
		return count;
	}

	static isErrorNotFound(errCode) {
		return errCode === '-16' || errCode === 404;
	}

	static getDataList(items, key) {
		const data = [];
		if (items) {
			items.forEach((item) => {
				data.push(item[key]);
			});
		}
		return data.join();
	}

	static getVersionFromRenditionLink(link) {
		let ver = '';
		if (link && link.length) {
			const pos = link.indexOf('/native');
			if (pos !== -1) {
				const v = 'versions/';
				const bpos = link.indexOf(v);
				if (bpos !== -1) {
					ver = link.substring(bpos + v.length, pos);
				}
			}
		}
		return ver;
	}

	static computeEntryID(id, prefix) {
		let eid = id;
		const pos = id ? id.indexOf(prefix) : -1;
		if (pos === -1) {
			eid = prefix + id;
		}
		return eid;
	}

	static extractIDFromEntry(eid, prefix) {
		let id = eid;
		const pos = eid ? eid.indexOf(prefix) : -1;
		if (pos !== -1) {
			id = eid.substring(prefix.length, eid.length);
		}
		return id;
	}

	static loadSpectrumIcons(extensionPath) {
		const name = ['css', 'spectrum', 'icon', 'spectrum-css-icons-medium.svg'];
		const fullPath = Utils.appendToPathArray(extensionPath, name);

		try {
			loadIcons(fullPath, function (err, svg) {
				if (err) {
					console.log('Load spectrum icons failed: ' + err);
					return false;
				} else {
					console.log('Load spectrum icons fine ' + svg);
				}
			});
		} catch (err) {
			console.log("Exception load spectrum icons " + err);
		}
	}

	static getSpectrumImagePath(extensionPath) {
		const name = ['css', 'spectrum', 'icon', "spectrum-css-icons-medium.svg"];
		const fullPath = Utils.appendToPathArray(extensionPath, name);
		return fullPath;
	}

	static pixelsToEMU(pix) {
		return pix * 9525;
	}
}

module.exports = Utils;