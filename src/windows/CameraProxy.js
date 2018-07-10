/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
*/

(function () {
    "use strict";

    var Display = Windows.Graphics.Display;
    var DisplayOrientations = Windows.Graphics.Display.DisplayOrientations;
    var PhotoOrientation = Windows.Storage.FileProperties.PhotoOrientation;
    var Sensors = Windows.Devices.Sensors;
    var SimpleOrientation = Windows.Devices.Sensors.SimpleOrientation;

    var CameraRotationHelper = WinJS.Class.define(function (cameraEnclosureLocation) {
        this._cameraEnclosureLocation = cameraEnclosureLocation;
        this._displayInformation = Display.DisplayInformation.getForCurrentView();
        this._orientationSensor = Sensors.SimpleOrientationSensor.getDefault();

        if (!CameraRotationHelper.isEnclosureLocationExternal(this._cameraEnclosureLocation) && this._orientationSensor != null) {
            this._orientationSensor.addEventListener("orientationchanged", this._simpleOrientationSensor_orientationChanged.bind(this));
        }
        this._displayInformation.addEventListener("orientationchanged", this._displayInformation_orientationChanged.bind(this));
    },
    {
        _cameraEnclosureLocation: null,
        _displayInformation: null,
        _orientationSensor: null,
        /// <summary>
        /// Gets the rotation to rotate ui elements
        /// </summary>
        getUIOrientation: function () {
            if (CameraRotationHelper.isEnclosureLocationExternal(this._cameraEnclosureLocation)) {
                // Cameras that are not attached to the device do not rotate along with it, so apply no rotation
                return SimpleOrientation.notRotated;
            }

            // Return the difference between the orientation of the device and the orientation of the app display
            var deviceOrientation = this._orientationSensor != null ? this._orientationSensor.getCurrentOrientation() : SimpleOrientation.notRotated;
            var displayOrientation = this.convertDisplayOrientationToSimpleOrientation(this._displayInformation.currentOrientation);
            return CameraRotationHelper.subtractOrientations(displayOrientation, deviceOrientation);
        },
        /// <summary>
        /// Gets the rotation of the camera to rotate pictures/videos when saving to file
        /// </summary>
        getCameraCaptureOrientation: function () {
            if (CameraRotationHelper.isEnclosureLocationExternal(this._cameraEnclosureLocation)) {
                // Cameras that are not attached to the device do not rotate along with it, so apply no rotation
                return SimpleOrientation.notRotated;
            }

            // Get the device orientation offset by the camera hardware offset
            var deviceOrientation = this._orientationSensor != null ? this._orientationSensor.getCurrentOrientation() : SimpleOrientation.notRotated;
            var result = CameraRotationHelper.subtractOrientations(deviceOrientation, this.getCameraOrientationRelativeToNativeOrientation());

            // If the preview is being mirrored for a front-facing camera, then the rotation should be inverted
            if (this.shouldMirrorPreview()) {
                result = CameraRotationHelper.mirrorOrientation(result);
            }
            return result;
        },
        /// <summary>
        /// Gets the rotation of the camera to display the camera preview
        /// </summary>
        getCameraPreviewOrientation: function () {
            if (CameraRotationHelper.isEnclosureLocationExternal(this._cameraEnclosureLocation)) {
                // Cameras that are not attached to the device do not rotate along with it, so apply no rotation
                return SimpleOrientation.NotRotated;
            }

            // Get the app display rotation offset by the camera hardware offset
            var result = this.convertDisplayOrientationToSimpleOrientation(this._displayInformation.currentOrientation);
            result = CameraRotationHelper.subtractOrientations(result, this.getCameraOrientationRelativeToNativeOrientation());
            // If the preview is being mirrored for a front-facing camera, then the rotation should be inverted
            if (this.shouldMirrorPreview()) {
                result = CameraRotationHelper.mirrorOrientation(result);
            }
            return result;
        },
        convertDisplayOrientationToSimpleOrientation: function (orientation) {
            var result;
            switch (orientation) {
                case DisplayOrientations.portraitFlipped:
                    result = SimpleOrientation.rotated90DegreesCounterclockwise;
                    break;
                case DisplayOrientations.landscapeFlipped:
                    result = SimpleOrientation.rotated180DegreesCounterclockwise;
                    break;
                case DisplayOrientations.portrait:
                    result = SimpleOrientation.rotated270DegreesCounterclockwise;
                    break;
                case DisplayOrientations.landscape:
                default:
                    result = SimpleOrientation.notRotated;
                    break;
            }

            // Above assumes landscape; offset is needed if native orientation is portrait
            if (this._displayInformation.nativeOrientation === DisplayOrientations.portrait) {
                result = CameraRotationHelper.addOrientations(result, SimpleOrientation.rotated90DegreesCounterclockwise);
            }

            return result;
        },
        _simpleOrientationSensor_orientationChanged: function (args) {

            if (args.orientation != SimpleOrientation.faceup && args.orientation != SimpleOrientation.facedown) {
                // Only raise the OrientationChanged event if the device is not parallel to the ground. This allows users to take pictures of documents (FaceUp)
                // or the ceiling (FaceDown) in portrait or landscape, by first holding the device in the desired orientation, and then pointing the camera
                // either up or down, at the desired subject.
                //Note: This assumes that the camera is either facing the same way as the screen, or the opposite way. For devices with cameras mounted
                //      on other panels, this logic should be adjusted.
                this.dispatchEvent("orientationchanged", { updatePreview: false });
            }
        },
        _displayInformation_orientationChanged: function (args) {
            this.dispatchEvent("orientationchanged", { updatePreview: true });
        },
        shouldMirrorPreview: function () {
            // It is recommended that applications mirror the preview for front-facing cameras, as it gives users a more natural experience, since it behaves more like a mirror
            return (this._cameraEnclosureLocation.panel === Windows.Devices.Enumeration.Panel.front);
        },
        getCameraOrientationRelativeToNativeOrientation: function () {
            // Get the rotation angle of the camera enclosure as it is mounted in the device hardware
            var enclosureAngle = CameraRotationHelper.convertClockwiseDegreesToSimpleOrientation(this._cameraEnclosureLocation.rotationAngleInDegreesClockwise);

            // Account for the fact that, on portrait-first devices, the built in camera sensor is read at a 90 degree offset to the native orientation
            if (this._displayInformation.nativeOrientation === DisplayOrientations.portrait && !CameraRotationHelper.isEnclosureLocationExternal(this._cameraEnclosureLocation)) {
                enclosureAngle = CameraRotationHelper.addOrientations(SimpleOrientation.rotated90DegreesCounterclockwise, enclosureAngle);
            }

            return enclosureAngle;
        }
    },
    {
        /// <summary>
        /// Detects whether or not the camera is external to the device
        /// </summary>
        isEnclosureLocationExternal: function (enclosureLocation) {
            return (enclosureLocation === null || enclosureLocation.Panel === Windows.Devices.Enumeration.Panel.unknown);
        },
        convertSimpleOrientationToPhotoOrientation: function (orientation) {
            switch (orientation) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    return PhotoOrientation.rotate90;
                case SimpleOrientation.rotated180DegreesCounterclockwise:
                    return PhotoOrientation.rotate180;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    return PhotoOrientation.rotate270;
                case SimpleOrientation.notRotated:
                default:
                    return PhotoOrientation.normal;
            }
        },
        convertSimpleOrientationToClockwiseDegrees: function (orientation) {
            switch (orientation) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    return 270;
                case SimpleOrientation.rotated180DegreesCounterclockwise:
                    return 180;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    return 90;
                case SimpleOrientation.rotRotated:
                default:
                    return 0;
            }
        },
        mirrorOrientation: function (orientation) {
            // This only affects the 90 and 270 degree cases, because rotating 0 and 180 degrees is the same clockwise and counter-clockwise
            switch (orientation) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    return SimpleOrientation.rotated270DegreesCounterclockwise;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    return SimpleOrientation.rotated90DegreesCounterclockwise;
            }
            return orientation;
        },
        addOrientations: function (a, b) {
            var aRot = this.convertSimpleOrientationToClockwiseDegrees(a);
            var bRot = this.convertSimpleOrientationToClockwiseDegrees(b);
            var result = (aRot + bRot) % 360;
            return this.convertClockwiseDegreesToSimpleOrientation(result);
        },
        subtractOrientations: function (a, b) {
            var aRot = this.convertSimpleOrientationToClockwiseDegrees(a);
            var bRot = this.convertSimpleOrientationToClockwiseDegrees(b);
            // Add 360 to ensure the modulus operator does not operate on a negative
            var result = (360 + (aRot - bRot)) % 360;
            return this.convertClockwiseDegreesToSimpleOrientation(result);
        },
        convertSimpleOrientationToVideoRotation: function (orientation) {
            switch (orientation) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    return VideoRotation.Clockwise270Degrees;
                case SimpleOrientation.rotated180DegreesCounterclockwise:
                    return VideoRotation.Clockwise180Degrees;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    return VideoRotation.Clockwise90Degrees;
                case SimpleOrientation.notRotated:
                default:
                    return VideoRotation.None;
            }
        },
        convertClockwiseDegreesToSimpleOrientation: function (orientation) {
            switch (orientation) {
                case 270:
                    return SimpleOrientation.rotated90DegreesCounterclockwise;
                case 180:
                    return SimpleOrientation.rotated180DegreesCounterclockwise;
                case 90:
                    return SimpleOrientation.rotated270DegreesCounterclockwise;
                case 0:
                default:
                    return SimpleOrientation.notRotated;
            }
        }
    });

    WinJS.Class.mix(CameraRotationHelper, WinJS.Utilities.eventMixin);

    WinJS.Namespace.define("SDKSample", {
        CameraRotationHelper: CameraRotationHelper
    });
})();

/* global Windows:true, URL:true, module:true, require:true, WinJS:true */

var Camera = require('./Camera');

var getAppData = function () {
    return Windows.Storage.ApplicationData.current;
};
var encodeToBase64String = function (buffer) {
    return Windows.Security.Cryptography.CryptographicBuffer.encodeToBase64String(buffer);
};

var OptUnique = Windows.Storage.CreationCollisionOption.generateUniqueName;
var CapMSType = Windows.Media.Capture.MediaStreamType;
var webUIApp = Windows.UI.WebUI.WebUIApplication;
var fileIO = Windows.Storage.FileIO;
var pickerLocId = Windows.Storage.Pickers.PickerLocationId;

module.exports = {

    // args will contain :
    //  ...  it is an array, so be careful
    // 0 quality:50,
    // 1 destinationType:Camera.DestinationType.FILE_URI,
    // 2 sourceType:Camera.PictureSourceType.CAMERA,
    // 3 targetWidth:-1,
    // 4 targetHeight:-1,
    // 5 encodingType:Camera.EncodingType.JPEG,
    // 6 mediaType:Camera.MediaType.PICTURE,
    // 7 allowEdit:false,
    // 8 correctOrientation:false,
    // 9 saveToPhotoAlbum:false,
    // 10 popoverOptions:null
    // 11 cameraDirection:0

    takePicture: function (successCallback, errorCallback, args) {
        var sourceType = args[2];

        if (sourceType !== Camera.PictureSourceType.CAMERA) {
            takePictureFromFile(successCallback, errorCallback, args);
        } else {
            takePictureFromCamera(successCallback, errorCallback, args);
        }
    }
};

// https://msdn.microsoft.com/en-us/library/windows/apps/ff462087(v=vs.105).aspx
var windowsVideoContainers = ['.avi', '.flv', '.asx', '.asf', '.mov', '.mp4', '.mpg', '.rm', '.srt', '.swf', '.wmv', '.vob'];

// Default aspect ratio 1.78 (16:9 hd video standard)
var DEFAULT_ASPECT_RATIO = '1.8';

// Highest possible z-index supported across browsers. Anything used above is converted to this value.
var HIGHEST_POSSIBLE_Z_INDEX = 2147483647;

var RotationKey = "C380465D-2271-428C-9B83-ECEA3B4A85C1";

// Resize method
function resizeImage(successCallback, errorCallback, file, targetWidth, targetHeight, encodingType) {
    var tempPhotoFileName = '';
    var targetContentType = '';

    if (encodingType === Camera.EncodingType.PNG) {
        tempPhotoFileName = 'camera_cordova_temp_return.png';
        targetContentType = 'image/png';
    } else {
        tempPhotoFileName = 'camera_cordova_temp_return.jpg';
        targetContentType = 'image/jpeg';
    }

    var storageFolder = getAppData().localFolder;
    file.copyAsync(storageFolder, file.name, Windows.Storage.NameCollisionOption.replaceExisting)
        .then(function (storageFile) {
            return fileIO.readBufferAsync(storageFile);
        })
        .then(function (buffer) {
            var strBase64 = encodeToBase64String(buffer);
            var imageData = 'data:' + file.contentType + ';base64,' + strBase64;
            var image = new Image(); /* eslint no-undef : 0 */
            image.src = imageData;
            image.onload = function () {
                var ratio = Math.min(targetWidth / this.width, targetHeight / this.height);
                var imageWidth = ratio * this.width;
                var imageHeight = ratio * this.height;

                var canvas = document.createElement('canvas');
                var storageFileName;

                canvas.width = imageWidth;
                canvas.height = imageHeight;

                canvas.getContext('2d').drawImage(this, 0, 0, imageWidth, imageHeight);

                var fileContent = canvas.toDataURL(targetContentType).split(',')[1];

                var storageFolder = getAppData().localFolder;

                storageFolder.createFileAsync(tempPhotoFileName, OptUnique)
                    .then(function (storagefile) {
                        var content = Windows.Security.Cryptography.CryptographicBuffer.decodeFromBase64String(fileContent);
                        storageFileName = storagefile.name;
                        return fileIO.writeBufferAsync(storagefile, content);
                    })
                    .done(function () {
                        successCallback('ms-appdata:///local/' + storageFileName);
                    }, errorCallback);
            };
        })
        .done(null, function (err) {
            errorCallback(err);
        });
}

// Because of asynchronous method, so let the successCallback be called in it.
function resizeImageBase64(successCallback, errorCallback, file, targetWidth, targetHeight) {
    fileIO.readBufferAsync(file).done(function (buffer) {
        var strBase64 = encodeToBase64String(buffer);
        var imageData = 'data:' + file.contentType + ';base64,' + strBase64;

        var image = new Image(); /* eslint no-undef : 0 */
        image.src = imageData;

        image.onload = function () {
            var ratio = Math.min(targetWidth / this.width, targetHeight / this.height);
            var imageWidth = ratio * this.width;
            var imageHeight = ratio * this.height;
            var canvas = document.createElement('canvas');

            canvas.width = imageWidth;
            canvas.height = imageHeight;

            var ctx = canvas.getContext('2d');
            ctx.drawImage(this, 0, 0, imageWidth, imageHeight);

            // The resized file ready for upload
            var finalFile = canvas.toDataURL(file.contentType);

            // Remove the prefix such as "data:" + contentType + ";base64," , in order to meet the Cordova API.
            var arr = finalFile.split(',');
            var newStr = finalFile.substr(arr[0].length + 1);
            successCallback(newStr);
        };
    }, function (err) { errorCallback(err); });
}

function takePictureFromFile(successCallback, errorCallback, args) {
    var mediaType = args[6];
    var destinationType = args[1];
    var targetWidth = args[3];
    var targetHeight = args[4];
    var encodingType = args[5];

    var fileOpenPicker = new Windows.Storage.Pickers.FileOpenPicker();
    if (mediaType === Camera.MediaType.PICTURE) {
        fileOpenPicker.fileTypeFilter.replaceAll(['.png', '.jpg', '.jpeg']);
        fileOpenPicker.suggestedStartLocation = pickerLocId.picturesLibrary;
    } else if (mediaType === Camera.MediaType.VIDEO) {
        fileOpenPicker.fileTypeFilter.replaceAll(windowsVideoContainers);
        fileOpenPicker.suggestedStartLocation = pickerLocId.videosLibrary;
    } else {
        fileOpenPicker.fileTypeFilter.replaceAll(['*']);
        fileOpenPicker.suggestedStartLocation = pickerLocId.documentsLibrary;
    }

    fileOpenPicker.pickSingleFileAsync().done(function (file) {
        if (!file) {
            errorCallback("User didn't choose a file.");
            return;
        }
        if (destinationType === Camera.DestinationType.FILE_URI || destinationType === Camera.DestinationType.NATIVE_URI) {
            if (targetHeight > 0 && targetWidth > 0) {
                resizeImage(successCallback, errorCallback, file, targetWidth, targetHeight, encodingType);
            } else {
                var storageFolder = getAppData().localFolder;
                file.copyAsync(storageFolder, file.name, Windows.Storage.NameCollisionOption.replaceExisting).done(function (storageFile) {
                    if (destinationType === Camera.DestinationType.NATIVE_URI) {
                        successCallback('ms-appdata:///local/' + storageFile.name);
                    } else {
                        successCallback(URL.createObjectURL(storageFile));
                    }
                }, function () {
                    errorCallback("Can't access localStorage folder.");
                });
            }
        } else {
            if (targetHeight > 0 && targetWidth > 0) {
                resizeImageBase64(successCallback, errorCallback, file, targetWidth, targetHeight);
            } else {
                fileIO.readBufferAsync(file).done(function (buffer) {
                    var strBase64 = encodeToBase64String(buffer);
                    successCallback(strBase64);
                }, errorCallback);
            }
        }
    }, function () {
        errorCallback("User didn't choose a file.");
    });
}

function takePictureFromCamera(successCallback, errorCallback, args) {
    var destinationType = args[1];
    var targetWidth = args[3];
    var targetHeight = args[4];
    var encodingType = args[5];
    var allowCrop = !!args[7];
    var saveToPhotoAlbum = args[9];
    var WMCapture = Windows.Media.Capture;
    var sensor = null;

    var capturePreview = null;
    var cameraCaptureButton = null;
    var cameraCancelButton = null;

    var ApplicationData = Windows.Storage.ApplicationData;
    var CameraRotationHelper = SDKSample.CameraRotationHelper;
    var DeviceInformation = Windows.Devices.Enumeration.DeviceInformation;
    var DeviceClass = Windows.Devices.Enumeration.DeviceClass;
    var Display = Windows.Graphics.Display;
    var DisplayOrientations = Windows.Graphics.Display.DisplayOrientations;
    var KnownLibraryId = Windows.Storage.KnownLibraryId;
    var Media = Windows.Media;
    var StorageLibrary = Windows.Storage.StorageLibrary;

    // Prevent the screen from sleeping while the camera is running
    var oDisplayRequest = new Windows.System.Display.DisplayRequest();

    // For listening to media property changes
    var oSystemMediaControls = Media.SystemMediaTransportControls.getForCurrentView();

    // MediaCapture and its state variables
    var oMediaCapture = null;
    var isInitialized = false;
    var isPreviewing = false;
    var isRecording = false;

    // UI state
    var _isSuspending = false;
    var _isUIActive = false;
    var _setupPromise = WinJS.Promise.wrap();

    // Information about the camera device
    var externalCamera = false;
    var mirroringPreview = false;

    setUpBasedOnStateAsync();

    /// <summary>
    /// Starts the preview and adjusts it for for rotation and mirroring after making a request to keep the screen on
    /// </summary>
    function startPreview() {
        // create style for take and cancel buttons
        var buttonStyle = 'width:45%;padding: 10px 16px;font-size: 18px;line-height: 1.3333333;color: #333;background-color: #fff;border-color: #ccc; border: 1px solid transparent;border-radius: 6px; display: block; margin: 20px; z-index: 1000;border-color: #adadad;';

        // Prevent the device from sleeping while the preview is running
        oDisplayRequest.requestActive();

        // Set the preview source in the UI and mirror it if necessary
        capturePreview = document.createElement('video');
        capturePreview.setAttribute('id', 'cameraPreview');
        capturePreview.style.cssText = 'position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: ' + (HIGHEST_POSSIBLE_Z_INDEX - 1) + ';';

        // Create capture button
        cameraCaptureButton = document.createElement('button');
        cameraCaptureButton.setAttribute('id', 'takePhoto');
        cameraCaptureButton.innerText = 'Take';
        cameraCaptureButton.style.cssText = buttonStyle + 'position: fixed; left: 0; bottom: 0; margin: 20px; z-index: ' + HIGHEST_POSSIBLE_Z_INDEX + ';';

        // Create cancel button
        cameraCancelButton = document.createElement('button');
        cameraCancelButton.setAttribute('id', 'cancelPhoto');
        cameraCancelButton.innerText = 'Cancel';
        cameraCancelButton.style.cssText = buttonStyle + 'position: fixed; right: 0; bottom: 0; margin: 20px; z-index: ' + HIGHEST_POSSIBLE_Z_INDEX + ';';

        var previewUrl = URL.createObjectURL(oMediaCapture);
        capturePreview.src = previewUrl;
        capturePreview.play();

        // Bind events to controls
        sensor = Windows.Devices.Sensors.SimpleOrientationSensor.getDefault();
        if (sensor !== null) {
            sensor.addEventListener('orientationchanged', onOrientationChange);
        }

        document.body.appendChild(capturePreview);
        document.body.appendChild(cameraCaptureButton);
        document.body.appendChild(cameraCancelButton);

        capturePreview.addEventListener("playing", function () {
            isPreviewing = true;
            updateCaptureControls();
            setPreviewRotationAsync();
        });
        cameraCaptureButton.addEventListener('click', onCameraCaptureButtonClick);
        cameraCancelButton.addEventListener('click', onCameraCancelButtonClick);
    }

    /**
     * When Capture button is clicked, try to capture a picture and return
     */
    function onCameraCaptureButtonClick () {
        // Make sure user can't click more than once
        if (this.getAttribute('clicked') === '1') {
            return false;
        } else {
            this.setAttribute('clicked', '1');
        }
        captureAction();
    }

    function captureAction () {

        var encodingProperties;
        var fileName;
        var tempFolder = getAppData().temporaryFolder;

        if (encodingType === Camera.EncodingType.PNG) {
            fileName = 'photo.png';
            encodingProperties = Windows.Media.MediaProperties.ImageEncodingProperties.createPng();
        } else {
            fileName = 'photo.jpg';
            encodingProperties = Windows.Media.MediaProperties.ImageEncodingProperties.createJpeg();
        }

        tempFolder.createFileAsync(fileName, OptUnique).
        then(function (tempCapturedFile) {
            return new WinJS.Promise(function (complete) {
                var photoStream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
                var finalStream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
                oMediaCapture.capturePhotoToStreamAsync(encodingProperties, photoStream).
                then(function () {
                    return Windows.Graphics.Imaging.BitmapDecoder.createAsync(photoStream);
                }).
                then(function (dec) {
                    finalStream.size = 0; // BitmapEncoder requires the output stream to be empty
                    return Windows.Graphics.Imaging.BitmapEncoder.createForTranscodingAsync(finalStream, dec);
                }).
                then(function (enc) {
                    // We need to rotate the photo wrt sensor orientation
                    if (sensor !== null) {
                        enc.bitmapTransform.rotation = orientationToRotation(sensor.getCurrentOrientation());
                    } else {
                        enc.bitmapTransform.rotation = Windows.Media.Capture.VideoRotation.clockwise90Degrees;
                        //enc.bitmapTransform.rotation = Windows.Media.Capture.VideoRotation.clockwise90Degrees;
                    }
                    return enc.flushAsync();
                }).
                then(function () {
                    return tempCapturedFile.openAsync(Windows.Storage.FileAccessMode.readWrite);
                }).
                then(function (fileStream) {
                    return Windows.Storage.Streams.RandomAccessStream.copyAndCloseAsync(finalStream, fileStream);
                }).
                done(function () {
                    photoStream.close();
                    finalStream.close();
                    complete(tempCapturedFile);
                }, function () {
                    photoStream.close();
                    finalStream.close();
                    throw new Error('An error has occured while capturing the photo.');
                });
            });
        }).
        done(function (capturedFile) {
            destroyCameraPreview();
            savePhoto(capturedFile, {
                destinationType: destinationType,
                targetHeight: targetHeight,
                targetWidth: targetWidth,
                encodingType: encodingType,
                saveToPhotoAlbum: saveToPhotoAlbum
            }, successCallback, errorCallback);
        }, function (err) {
            destroyCameraPreview();
            errorCallback(err);
        });
    }

    /**
     * When Cancel button is clicked, destroy camera preview and return with error callback
     */
    function onCameraCancelButtonClick () {
        // Make sure user can't click more than once
        if (this.getAttribute('clicked') === '1') {
            return false;
        } else {
            this.setAttribute('clicked', '1');
        }
        destroyCameraPreview();
        errorCallback('no image selected');
    }

    function destroyCameraPreview () {
        // If sensor is available, remove event listener
        if (sensor !== null) {
            sensor.removeEventListener('orientationchanged', onOrientationChange);
        }

        // Pause and dispose preview element
        capturePreview.pause();
        capturePreview.src = null;

        // Remove event listeners from buttons
        cameraCaptureButton.removeEventListener('click', onCameraCaptureButtonClick);
        cameraCancelButton.removeEventListener('click', onCameraCancelButtonClick);

        // Remove elements
        [capturePreview, cameraCaptureButton, cameraCancelButton].forEach(function (elem) {
            if (elem /* && elem in document.body.childNodes */) {
                document.body.removeChild(elem);
            }
        });

        // Stop and dispose media capture manager
        if (oMediaCapture) {
            oMediaCapture.stopRecordAsync();
            oMediaCapture = null;
        }
    }

    /// <summary>
    /// Gets the current orientation of the UI in relation to the device (when AutoRotationPreferences cannot be honored) and applies a corrective rotation to the preview
    /// </summary>
    /// <returns></returns>
    function setPreviewRotationAsync() {
        // Add rotation metadata to the preview stream to make sure the aspect ratio / dimensions match when rendering and getting preview frames
        var rotation = oRotationHelper.getCameraPreviewOrientation();
        var props = oMediaCapture.videoDeviceController.getMediaStreamProperties(WMCapture.MediaStreamType.videoPreview);
        props.properties.insert(RotationKey, CameraRotationHelper.convertSimpleOrientationToClockwiseDegrees(rotation));
        return oMediaCapture.setEncodingPropertiesAsync(WMCapture.MediaStreamType.videoPreview, props, null);
    }

    /// <summary>
    /// Stops the preview and deactivates a display request, to allow the screen to go into power saving modes
    /// </summary>
    /// <returns></returns>
    function stopPreview() {
        isPreviewing = false;

        // Cleanup the UI
        capturePreview.pause();
        capturePreview.src = null;

        // Allow the device screen to sleep now that the preview is stopped
        oDisplayRequest.requestRelease();
    }

    /// <summary>
    /// Initializes the MediaCapture, registers events, gets camera device information for mirroring and rotating, starts preview and unlocks the UI
    /// </summary>
    /// <returns></returns>
    function initializeCameraAsync() {
        console.log("InitializeCameraAsync");

        // Get available devices for capturing pictures
        return findCameraDeviceByPanelAsync(Windows.Devices.Enumeration.Panel.back).
        then(function (camera) {
            if (camera === null) {
                console.log("No camera device found!");
                return;
            }
            // Figure out where the camera is located
            if (!camera.enclosureLocation || camera.enclosureLocation.panel === Windows.Devices.Enumeration.Panel.unknown) {
                // No information on the location of the camera, assume it's an external camera, not integrated on the device
                externalCamera = true;
            } else {
                // Camera is fixed on the device
                externalCamera = false;

                // Only mirror the preview if the camera is on the front panel
                mirroringPreview = (camera.enclosureLocation.panel === Windows.Devices.Enumeration.Panel.front);
            }

            // Initialize rotationHelper
            oRotationHelper = new CameraRotationHelper(camera.enclosureLocation);
            oRotationHelper.addEventListener("orientationchanged", rotationHelper_orientationChanged);

            // Initialize rotationHelper
            oMediaCapture = new WMCapture.MediaCapture();

            // Register for a notification when video recording has reached the maximum time and when something goes wrong
            oMediaCapture.addEventListener("recordlimitationexceeded", mediaCapture_recordLimitationExceeded);
            oMediaCapture.addEventListener("failed", mediaCapture_failed);

            var settings = new WMCapture.MediaCaptureInitializationSettings();
            settings.videoDeviceId = camera.id;
            settings.streamingCaptureMode = WMCapture.StreamingCaptureMode.video;

            // Initialize media capture and start the preview
            return oMediaCapture.initializeAsync(settings).
            then(function () {
                isInitialized = true;
                startPreview();
            });
        }, function (error) {
            console.log(error.message);
        }).done();
    }

    /// <summary>
    /// Initialize or clean up the camera and our UI,
    /// depending on the page state.
    /// </summary>
    /// <returns></returns>
    function setUpBasedOnStateAsync(previousPromise) {
        // Avoid reentrancy: Wait until nobody else is in this function.
        // WinJS.Promise has no way to check whether a promise has completed,
        // so we wait on the promise and then see if another task changed it.
        // if not, then it was already completed.
        if (previousPromise !== _setupPromise) {
            previousPromise = _setupPromise;
            return _setupPromise.then(function() {
                return setUpBasedOnStateAsync(previousPromise);
            });
        }

        // We want our UI to be active if
        // * We are the current active page.
        // * The window is visible.
        // * The app is not suspending.
        var wantUIActive = !document.hidden && !_isSuspending;

        if (_isUIActive != wantUIActive) {
            _isUIActive = wantUIActive;

            if (wantUIActive) {
                _setupPromise = WinJS.Promise.join(setupUiAsync(), initializeCameraAsync());
            } else {
                _setupPromise  = WinJS.Promise.join(cleanupCameraAsync(), cleanupUiAsync());
            }
        }

        return _setupPromise;
    }

    function savePhoto (picture, options, successCallback, errorCallback) {
        // success callback for capture operation
        var success = function (picture) {
            if (options.destinationType === Camera.DestinationType.FILE_URI || options.destinationType === Camera.DestinationType.NATIVE_URI) {
                if (options.targetHeight > 0 && options.targetWidth > 0) {
                    resizeImage(successCallback, errorCallback, picture, options.targetWidth, options.targetHeight, options.encodingType);
                } else {
                    picture.copyAsync(getAppData().localFolder, picture.name, OptUnique).done(function (copiedFile) {
                            successCallback('ms-appdata:///local/' + copiedFile.name);
                        }, errorCallback);
                }
            } else {
                if (options.targetHeight > 0 && options.targetWidth > 0) {
                    resizeImageBase64(successCallback, errorCallback, picture, options.targetWidth, options.targetHeight);
                } else {
                    fileIO.readBufferAsync(picture).done(function (buffer) {
                            var strBase64 = encodeToBase64String(buffer);
                            picture.deleteAsync().done(function () {
                                    successCallback(strBase64);
                                }, function (err) {
                                    errorCallback(err);
                                });
                        }, errorCallback);
                }
            }
        };

        if (!options.saveToPhotoAlbum) {
            success(picture);
        } else {
            var savePicker = new Windows.Storage.Pickers.FileSavePicker();
            var saveFile = function (file) {
                if (file) {
                    // Prevent updates to the remote version of the file until we're done
                    Windows.Storage.CachedFileManager.deferUpdates(file);
                    picture.moveAndReplaceAsync(file).
                    then(function () {
                        // Let Windows know that we're finished changing the file so
                        // the other app can update the remote version of the file.
                        return Windows.Storage.CachedFileManager.completeUpdatesAsync(file);
                    }).
                    done(function (updateStatus) {
                        if (updateStatus === Windows.Storage.Provider.FileUpdateStatus.complete) {
                            success(picture);
                        } else {
                            errorCallback('File update status is not complete.');
                        }
                    }, errorCallback);
                } else {
                    errorCallback('Failed to select a file.');
                }
            };
            savePicker.suggestedStartLocation = pickerLocId.picturesLibrary;

            if (options.encodingType === Camera.EncodingType.PNG) {
                savePicker.fileTypeChoices.insert('PNG', ['.png']);
                savePicker.suggestedFileName = 'photo.png';
            } else {
                savePicker.fileTypeChoices.insert('JPEG', ['.jpg']);
                savePicker.suggestedFileName = 'photo.jpg';
            }

            // If Windows Phone 8.1 use pickSaveFileAndContinue()
            if (navigator.appVersion.indexOf('Windows Phone 8.1') >= 0) {
                /*
                Need to add and remove an event listener to catch activation state
                Using FileSavePicker will suspend the app and it's required to catch the pickSaveFileContinuation
                https://msdn.microsoft.com/en-us/library/windows/apps/xaml/dn631755.aspx
                */
                var fileSaveHandler = function (eventArgs) {
                    if (eventArgs.kind === Windows.ApplicationModel.Activation.ActivationKind.pickSaveFileContinuation) {
                        var file = eventArgs.file;
                        saveFile(file);
                        webUIApp.removeEventListener('activated', fileSaveHandler);
                    }
                };
                webUIApp.addEventListener('activated', fileSaveHandler);
                savePicker.pickSaveFileAndContinue();
            } else {
                savePicker.pickSaveFileAsync().
                done(saveFile, errorCallback);
            }
        }
    }

    /// <summary>
    /// Handles an orientation changed event
    /// </summary>
    function rotationHelper_orientationChanged(event) {
        if (event.detail.updatePreview) {
            setPreviewRotationAsync();
        }
        updateButtonOrientation();
    }

    /// <summary>
    /// Uses the current device orientation in space and page orientation on the screen to calculate the rotation
    /// transformation to apply to the controls
    /// </summary>
    function updateButtonOrientation() {
        // Rotate the buttons in the UI to match the rotation of the device
        /* TODO
        var angle = CameraRotationHelper.convertSimpleOrientationToClockwiseDegrees(oRotationHelper.getUIOrientation());

        // Rotate the buttons in the UI to match the rotation of the device
        videoButton.style.transform = "rotate(" + angle + "deg)";
        photoButton.style.transform = "rotate(" + angle + "deg)";
        */
    }

    /// <summary>
    /// Cleans up the camera resources (after stopping any video recording and/or preview if necessary) and unregisters from MediaCapture events
    /// </summary>
    /// <returns></returns>
    function cleanupCameraAsync() {
        console.log("cleanupCameraAsync");

        var promiseList = [];

        if (isInitialized) {
            // If a recording is in progress during cleanup, stop it to save the recording
            if (isRecording) {
                var stopRecordPromise = stopRecordingAsync();
                promiseList.push(stopRecordPromise);
            }

            if (isPreviewing) {
                // The call to stop the preview is included here for completeness, but can be
                // safely removed if a call to MediaCapture.close() is being made later,
                // as the preview will be automatically stopped at that point
                stopPreview();
            }
            isInitialized = false;
        }

        // When all our tasks complete, clean up MediaCapture
        return WinJS.Promise.join(promiseList).
        then(function () {
            if (oMediaCapture != null) {
                oMediaCapture.removeEventListener("recordlimitationexceeded", mediaCapture_recordLimitationExceeded);
                oMediaCapture.removeEventListener("failed", mediaCapture_failed);
                oMediaCapture.close();
                oMediaCapture = null;
            }
        });
    }

    /// <summary>
    /// Gets the current orientation of the UI in relation to the device (when AutoRotationPreferences cannot be honored) and applies a corrective rotation to the preview
    /// </summary>
    /// <returns></returns>
    /* TODO
    function setPreviewRotationAsync() {
        // Add rotation metadata to the preview stream to make sure the aspect ratio / dimensions match when rendering and getting preview frames
        var rotation = oRotationHelper.getCameraPreviewOrientation();
        var props = oMediaCapture.videoDeviceController.getMediaStreamProperties(Capture.MediaStreamType.videoPreview);
        props.properties.insert(RotationKey, CameraRotationHelper.convertSimpleOrientationToClockwiseDegrees(rotation));
        return oMediaCapture.setEncodingPropertiesAsync(Capture.MediaStreamType.videoPreview, props, null);
    }
    */

    /// <summary>
    /// Takes a photo to a StorageFile and adds rotation metadata to it
    /// </summary>
    /// <returns></returns>
    function takePhotoAsync() {
        // While taking a photo, keep the video button enabled only if the camera supports simultaneously taking pictures and recording video
        //        videoButton.disabled = oMediaCapture.mediaCaptureSettings.concurrentRecordAndPhotoSupported;

        var Streams = Windows.Storage.Streams;
        var inputStream = new Streams.InMemoryRandomAccessStream();

        // Take the picture
        console.log("Taking photo...");
        return oMediaCapture.capturePhotoToStreamAsync(Windows.Media.MediaProperties.ImageEncodingProperties.createJpeg(), inputStream).
        then(function () {
            return oCaptureFolder.createFileAsync("SimplePhoto.jpg", Windows.Storage.CreationCollisionOption.generateUniqueName);
        }).
        then(function (file) {
            console.log("Photo taken! Saving to " + file.path);

            // Done taking a photo, so re-enable the button
            var photoOrientation = CameraRotationHelper.convertSimpleOrientationToPhotoOrientation(oRotationHelper.getCameraCaptureOrientation());
            return reencodeAndSavePhotoAsync(inputStream, file, photoOrientation);
        }).then(function () {
            console.log("Photo saved!");
        }, function (error) {
            console.log(error.message);
        }).done();
    }

    /// <summary>
    /// Attempts to find and return a device mounted on the panel specified, and on failure to find one it will return the first device listed
    /// </summary>
    /// <param name="panel">The desired panel on which the returned device should be mounted, if available</param>
    /// <returns></returns>
    function findCameraDeviceByPanelAsync(panel) {
        var deviceInfo = null;
        // Get available devices for capturing pictures
        return DeviceInformation.findAllAsync(DeviceClass.videoCapture).
        then(function (devices) {
            devices.forEach(function (cameraDeviceInfo) {
                if (cameraDeviceInfo.enclosureLocation != null && cameraDeviceInfo.enclosureLocation.panel === panel) {
                    deviceInfo = cameraDeviceInfo;
                    return;
                }
            });

            // Nothing matched, just return the first
            if (!deviceInfo && devices.length > 0) {
                deviceInfo = devices.getAt(0);
            }

            return deviceInfo;
        });
    }

    /// <summary>
    /// Applies the given orientation to a photo stream and saves it as a StorageFile
    /// </summary>
    /// <param name="stream">The photo stream</param>
    /// <param name="photoOrientation">The orientation metadata to apply to the photo</param>
    /// <returns></returns>
    function reencodeAndSavePhotoAsync(inputStream, file, orientation) {
        var Imaging = Windows.Graphics.Imaging;
        var bitmapDecoder = null,
            bitmapEncoder = null,
            outputStream = null;

        return Imaging.BitmapDecoder.createAsync(inputStream).
        then(function (decoder) {
            bitmapDecoder = decoder;
            return file.openAsync(Windows.Storage.FileAccessMode.readWrite);
        }).then(function (outStream) {
            outputStream = outStream;
            return Imaging.BitmapEncoder.createForTranscodingAsync(outputStream, bitmapDecoder);
        }).then(function (encoder) {
            bitmapEncoder = encoder;
            var properties = new Imaging.BitmapPropertySet();
            properties.insert("System.Photo.Orientation", new Imaging.BitmapTypedValue(orientation, Windows.Foundation.PropertyType.uint16));
            return bitmapEncoder.bitmapProperties.setPropertiesAsync(properties)
        }).then(function() {
            return bitmapEncoder.flushAsync();
        }).then(function () {
            inputStream.close();
            outputStream.close();
        });
    }

    /// <summary>
    /// This method will update the icons, enable/disable and show/hide the photo/video buttons depending on the current state of the app and the capabilities of the device
    /// </summary>
    function updateCaptureControls() {
        // The buttons should only be enabled if the preview started sucessfully
        /* TODO
        photoButton.disabled = !isPreviewing;
        videoButton.disabled = !isPreviewing;
        */

        // Update recording button to show "Stop" icon instead of red "Record" icon
        /* TODO
        var vidButton = document.getElementById("videoButton").winControl;
        if (isRecording) {
            vidButton.icon = "stop";
        }
        else {
            vidButton.icon = "video";
        }

        // If the camera doesn't support simultaneously taking pictures and recording video, disable the photo button on record
        if (isInitialized && !oMediaCapture.mediaCaptureSettings.concurrentRecordAndPhotoSupported) {
            photoButton.disabled = isRecording;
        }
        */
    }
    
    /// <summary>
    /// Attempts to lock the page orientation, hide the StatusBar (on Phone) and registers event handlers for hardware buttons and orientation sensors
    /// </summary>
    function setupUiAsync() {
        // Attempt to lock page to landscape orientation to prevent the CaptureElement from rotating, as this gives a better experience
        Display.DisplayInformation.autoRotationPreferences = DisplayOrientations.landscape;

        registerEventHandlers();

        return StorageLibrary.getLibraryAsync(KnownLibraryId.pictures).
        then(function (picturesLibrary) {
            // Fall back to the local app storage if the Pictures Library is not available
            oCaptureFolder = picturesLibrary.saveFolder || ApplicationData.current.localFolder;

            // Hide the status bar
            if (Windows.Foundation.Metadata.ApiInformation.isTypePresent("Windows.UI.ViewManagement.StatusBar")) {
                return Windows.UI.ViewManagement.StatusBar.getForCurrentView().hideAsync();
            } else {
                return WinJS.Promise.as();
            }
        });
    }

    /// <summary>
    /// Unregisters event handlers for hardware buttons and orientation sensors, allows the StatusBar (on Phone) to show, and removes the page orientation lock
    /// </summary>
    /// <returns></returns>
    function cleanupUiAsync() {
        unregisterEventHandlers();

        // Show the status bar
        if (Windows.Foundation.Metadata.ApiInformation.isTypePresent("Windows.UI.ViewManagement.StatusBar")) {
            return Windows.UI.ViewManagement.StatusBar.getForCurrentView().showAsync();
        } else {
            return WinJS.Promise.as();
        }
    }

    /// <summary>
    /// Registers event handlers for hardware buttons and orientation sensors, and performs an initial update of the UI rotation
    /// </summary>
    function registerEventHandlers() {
        if (Windows.Foundation.Metadata.ApiInformation.isTypePresent("Windows.Phone.UI.Input.HardwareButtons")) {
            Windows.Phone.UI.Input.HardwareButtons.addEventListener("camerapressed", hardwareButtons_cameraPress);
        }

        oSystemMediaControls.addEventListener("propertychanged", systemMediaControls_PropertyChanged);
    }

    /// <summary>
    /// Unregisters event handlers for hardware buttons and orientation sensors
    /// </summary>
    function unregisterEventHandlers() {
        if (Windows.Foundation.Metadata.ApiInformation.isTypePresent("Windows.Phone.UI.Input.HardwareButtons")) {
            Windows.Phone.UI.Input.HardwareButtons.removeEventListener("camerapressed", hardwareButtons_cameraPress);
        }

        oSystemMediaControls.removeEventListener("propertychanged", systemMediaControls_PropertyChanged);
    }

    /// <summary>
    /// In the event of the app being minimized this method handles media property change events. If the app receives a mute
    /// notification, it is no longer in the foregroud.
    /// </summary>
    /// <param name="args"></param>
    function systemMediaControls_PropertyChanged(args) {
        // Check to see if the app is being muted. If so, it is being minimized.
        // Otherwise if it is not initialized, it is being brought into focus.
// TODO
//        if (args.target.soundLevel === Media.SoundLevel.muted) {
//            cleanupCameraAsync();
//        } else if (!isInitialized) {
            initializeCameraAsync();
//        }
    }

    function hardwareButtons_cameraPress() {
        takePhotoAsync();
    }

    /// <summary>
    /// This is a notification that recording has to stop, and the app is expected to finalize the recording
    /// </summary>
    function mediaCapture_recordLimitationExceeded() {
        stopRecordingAsync().done(function () {
            updateCaptureControls();
        });
    }

    function mediaCapture_failed(errorEventArgs) {
        console.log("MediaCapture_Failed: 0x" + errorEventArgs.code + ": " + errorEventArgs.message);

        cleanupCameraAsync().done(function() {
            updateCaptureControls();
        });    
    }

    /**
     * When the phone orientation change, get the event and change camera preview rotation
     * @param  {Object} e - SimpleOrientationSensorOrientationChangedEventArgs
     */
    function onOrientationChange (e) {
        setPreviewRotation(e.orientation);
    }

    /**
     * Converts SimpleOrientation to a VideoRotation to remove difference between camera sensor orientation
     * and video orientation
     * @param  {number} orientation - Windows.Devices.Sensors.SimpleOrientation
     * @return {number} - Windows.Media.Capture.VideoRotation
     */
    function orientationToRotation (orientation) {
        // VideoRotation enumerable and BitmapRotation enumerable have the same values
        // https://msdn.microsoft.com/en-us/library/windows/apps/windows.media.capture.videorotation.aspx
        // https://msdn.microsoft.com/en-us/library/windows/apps/windows.graphics.imaging.bitmaprotation.aspx

        switch (orientation) {
        // portrait
        case Windows.Devices.Sensors.SimpleOrientation.notRotated:
            return Windows.Media.Capture.VideoRotation.clockwise90Degrees;
        // landscape
        case Windows.Devices.Sensors.SimpleOrientation.rotated90DegreesCounterclockwise:
            return Windows.Media.Capture.VideoRotation.none;
        // portrait-flipped (not supported by WinPhone Apps)
        case Windows.Devices.Sensors.SimpleOrientation.rotated180DegreesCounterclockwise:
            // Falling back to portrait default
            return Windows.Media.Capture.VideoRotation.clockwise90Degrees;
        // landscape-flipped
        case Windows.Devices.Sensors.SimpleOrientation.rotated270DegreesCounterclockwise:
            return Windows.Media.Capture.VideoRotation.clockwise180Degrees;
        // faceup & facedown
        default:
            // Falling back to portrait default
            return Windows.Media.Capture.VideoRotation.clockwise90Degrees;
        }
    }

    /**
     * Rotates the current MediaCapture's video
     * @param {number} orientation - Windows.Devices.Sensors.SimpleOrientation
     */
    function setPreviewRotation (orientation) {
        oMediaCapture.setPreviewRotation(orientationToRotation(orientation));
    }
}

require('cordova/exec/proxy').add('Camera', module.exports);
