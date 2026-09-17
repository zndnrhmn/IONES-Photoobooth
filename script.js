/* =========================================================
   IONES 2026 PHOTOBOOTH
   =========================================================

   FILES:
   index.html
   style.css
   script.js
   frame.png

   Put frame.png in the SAME folder as these 3 files.

   Google Drive:
   Replace GOOGLE_SCRIPT_URL with your Apps Script Web App URL.
   ========================================================= */


/* =========================================================
   GOOGLE APPS SCRIPT URL
   ========================================================= */

const GOOGLE_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwbC6aVWF8ufwBy4GLe6eluiMJXXU-h3QapD55_ct1W8Yp6XhEwrXm1YKWbJvgDMmYS/exec";


/* =========================================================
   FRAME SIZE
   Your uploaded IONES frame:
   685 x 2048 px
   ========================================================= */

const FRAME_WIDTH = 685;
const FRAME_HEIGHT = 2048;


/* =========================================================
   PHOTO SLOT POSITIONS
   These positions match the uploaded IONES frame.
   ========================================================= */

const PHOTO_SLOTS = [
    {
        x: 60,
        y: 149,
        width: 561,
        height: 347
    },
    {
        x: 60,
        y: 539,
        width: 561,
        height: 422
    },
    {
        x: 60,
        y: 1004,
        width: 561,
        height: 422
    },
    {
        x: 60,
        y: 1469,
        width: 561,
        height: 328
    }
];


/* =========================================================
   ELEMENTS
   ========================================================= */

const startScreen =
    document.getElementById("startScreen");

const cameraScreen =
    document.getElementById("cameraScreen");

const resultScreen =
    document.getElementById("resultScreen");

const startButton =
    document.getElementById("startButton");

const captureButton =
    document.getElementById("captureButton");

const retakeButton =
    document.getElementById("retakeButton");

const downloadButton =
    document.getElementById("downloadButton");

const video =
    document.getElementById("video");

const countdownElement =
    document.getElementById("countdown");

const photoCounter =
    document.getElementById("photoCounter");

const resultImage =
    document.getElementById("resultImage");

const qrCode =
    document.getElementById("qrcode");

const statusElement =
    document.getElementById("status");

const loading =
    document.getElementById("loading");


/* =========================================================
   VARIABLES
   ========================================================= */

let stream = null;
let photos = [];
let finalImageData = null;
let finalDownloadURL = null;
let isTakingPhotos = false;


/* =========================================================
   FRAME IMAGE
   ========================================================= */

const frameImage = new Image();

frameImage.src = "frame.png";


/* =========================================================
   SCREEN CONTROL
   ========================================================= */

function showScreen(screen) {
    document.querySelectorAll(".screen").forEach(item => {
        item.classList.remove("active");
    });

    screen.classList.add("active");
}


/* =========================================================
   CAMERA
   ========================================================= */

async function startCamera() {
    try {
        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            throw new Error(
                "Camera API is not available. " +
                "Use HTTPS or localhost."
            );
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {
                    ideal: "user"
                },
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

    } catch (error) {
        console.error(error);

        alert(
            "Camera access failed.\n\n" +
            "Please allow camera permission " +
            "and make sure the website uses HTTPS."
        );

        showScreen(startScreen);
    }
}


function stopCamera() {
    if (!stream) return;

    stream.getTracks().forEach(track => {
        track.stop();
    });

    stream = null;
    video.srcObject = null;
}


/* =========================================================
   COUNTDOWN
   ========================================================= */

function runCountdown(seconds = 3) {
    return new Promise(resolve => {
        let count = seconds;

        countdownElement.textContent = count;

        const interval = setInterval(() => {
            count--;

            if (count > 0) {
                countdownElement.textContent = count;
            } else {
                clearInterval(interval);
                countdownElement.textContent = "";
                resolve();
            }
        }, 1000);
    });
}


/* =========================================================
   CAPTURE PHOTO
   ========================================================= */

function capturePhoto() {
    const canvas =
        document.createElement("canvas");

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    /*
     * Mirror selfie camera so the preview
     * and final photo look natural.
     */

    ctx.translate(width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        0,
        0,
        width,
        height
    );

    const image = new Image();

    image.src = canvas.toDataURL(
        "image/jpeg",
        0.92
    );

    return image;
}


/* =========================================================
   WAIT FOR IMAGE
   ========================================================= */

function waitForImage(image) {
    return new Promise(resolve => {
        if (image.complete &&
            image.naturalWidth > 0) {

            resolve();
            return;
        }

        image.onload = resolve;
    });
}


/* =========================================================
   DRAW IMAGE COVER
   Prevents stretching/distortion.
   ========================================================= */

function drawImageCover(
    ctx,
    image,
    x,
    y,
    width,
    height
) {
    const imageRatio =
        image.width / image.height;

    const boxRatio =
        width / height;

    let sourceWidth;
    let sourceHeight;
    let sourceX;
    let sourceY;

    if (imageRatio > boxRatio) {

        /*
         * Photo is wider than the slot.
         * Crop left/right.
         */

        sourceHeight = image.height;

        sourceWidth =
            image.height * boxRatio;

        sourceX =
            (image.width - sourceWidth) / 2;

        sourceY = 0;

    } else {

        /*
         * Photo is taller than the slot.
         * Crop top/bottom.
         */

        sourceWidth = image.width;

        sourceHeight =
            image.width / boxRatio;

        sourceX = 0;

        sourceY =
            (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(
        image,

        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,

        x,
        y,
        width,
        height
    );
}


/* =========================================================
   CREATE FINAL PHOTOSTRIP
   ========================================================= */

async function createFinalPhotostrip() {
    await waitForImage(frameImage);

    const canvas =
        document.createElement("canvas");

    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;

    const ctx =
        canvas.getContext("2d");

    /*
     * Draw each photo behind the frame.
     */

    for (let i = 0; i < photos.length; i++) {
        const slot = PHOTO_SLOTS[i];

        drawImageCover(
            ctx,
            photos[i],
            slot.x,
            slot.y,
            slot.width,
            slot.height
        );
    }

    /*
     * Draw the PNG frame ON TOP.
     */

    ctx.drawImage(
        frameImage,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
    );

    /*
     * PNG preserves the transparent areas
     * in the uploaded frame.
     */

    return canvas.toDataURL(
        "image/png"
    );
}


/* =========================================================
   TAKE FOUR PHOTOS
   ========================================================= */

async function takePhotos() {
    if (isTakingPhotos) return;

    isTakingPhotos = true;
    photos = [];

    captureButton.style.display = "none";

    for (let i = 0; i < 4; i++) {

        photoCounter.textContent =
            `Photo ${i + 1} of 4`;

        /*
         * Give the user 3 seconds to pose.
         */

        await runCountdown(3);

        const photo =
            capturePhoto();

        await waitForImage(photo);

        photos.push(photo);

        /*
         * Short pause between shots.
         */

        await new Promise(resolve => {
            setTimeout(resolve, 700);
        });
    }

    isTakingPhotos = false;

    captureButton.style.display = "block";

    await showFinalResult();
}


/* =========================================================
   FINAL RESULT
   ========================================================= */

async function showFinalResult() {
    stopCamera();

    showScreen(resultScreen);

    loading.classList.add("active");

    statusElement.textContent =
        "Creating your photostrip...";

    try {

        finalImageData =
            await createFinalPhotostrip();

        resultImage.src =
            finalImageData;

        qrCode.innerHTML = "";

        /*
         * Upload if Google Apps Script
         * has already been configured.
         */

        if (
            GOOGLE_SCRIPT_URL &&
            !GOOGLE_SCRIPT_URL.includes(
                "PASTE_YOUR"
            )
        ) {

            statusElement.textContent =
                "Uploading to Google Drive...";

            await uploadToGoogleDrive(
                finalImageData
            );

        } else {

            /*
             * Google Drive is not configured yet.
             */

            statusElement.textContent =
                "Photo ready! Configure Google Drive for QR download.";

            /*
             * Direct download still works.
             */

            downloadButton.disabled = false;
        }

    } catch (error) {

        console.error(error);

        statusElement.textContent =
            "Photo created. You can still download it.";

    }

    loading.classList.remove("active");
}


/* =========================================================
   GOOGLE DRIVE UPLOAD
   ========================================================= */

async function uploadToGoogleDrive(imageData) {

    const fileName =
        "IONES-Photobooth-" +
        Date.now() +
        ".png";

    statusElement.textContent =
        "Uploading to Google Drive...";


    try {

        const response = await fetch(
            GOOGLE_SCRIPT_URL,
            {
                method: "POST",

                /*
                 * Jangan menggunakan application/json
                 * karena bisa menyebabkan preflight/CORS.
                 */

                headers: {
                    "Content-Type":
                        "text/plain;charset=utf-8"
                },

                body: JSON.stringify({
                    image: imageData,
                    fileName: fileName
                })
            }
        );


        if (!response.ok) {

            throw new Error(
                "Server error: " +
                response.status
            );

        }


        const result =
            await response.json();


        console.log(
            "Google Apps Script response:",
            result
        );


        if (!result.success) {

            throw new Error(
                result.message ||
                "Upload failed."
            );

        }


        /*
         * Save download URL
         */

        finalDownloadURL =
            result.url;


        /*
         * Generate QR
         */

        generateQRCode(
            finalDownloadURL
        );


        statusElement.textContent =
            "Saved successfully! Scan the QR code to download.";


    } catch (error) {

        console.error(
            "UPLOAD ERROR:",
            error
        );


        statusElement.textContent =
            "Upload failed: " +
            error.message;

        /*
         * Keep the normal download button working.
         */

    }
}


/* =========================================================
   QR CODE
   ========================================================= */

function generateQRCode(url) {

    qrCode.innerHTML = "";

    new QRCode(qrCode, {
        text: url,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
    });
}


/* =========================================================
   DOWNLOAD
   ========================================================= */

downloadButton.addEventListener(
    "click",
    () => {

        if (!finalImageData) {
            return;
        }

        const link =
            document.createElement("a");

        link.href =
            finalImageData;

        link.download =
            "IONES-Photobooth.png";

        document.body.appendChild(link);

        link.click();

        link.remove();
    }
);


/* =========================================================
   START
   ========================================================= */

startButton.addEventListener(
    "click",
    async () => {

        showScreen(cameraScreen);

        await startCamera();

        /*
         * Wait for camera to stabilize.
         */

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
        });

        if (stream) {
            await takePhotos();
        }
    }
);


/* =========================================================
   MANUAL CAPTURE BUTTON
   =========================================================

   The normal flow automatically takes all 4 photos.
   This button is kept as a fallback/manual option.
   ========================================================= */

captureButton.addEventListener(
    "click",
    async () => {

        await takePhotos();

    }
);


/* =========================================================
   RETAKE
   ========================================================= */

retakeButton.addEventListener(
    "click",
    async () => {

        stopCamera();

        photos = [];
        finalImageData = null;
        finalDownloadURL = null;

        resultImage.src = "";
        qrCode.innerHTML = "";

        statusElement.textContent =
            "Preparing your photo...";

        showScreen(cameraScreen);

        await startCamera();

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
        });

        if (stream) {
            await takePhotos();
        }
    }
);


/* =========================================================
   PREVENT DOUBLE-TAP ZOOM
   ========================================================= */

document.addEventListener(
    "dblclick",
    event => {
        event.preventDefault();
    },
    {
        passive: false
    }
);


/* =========================================================
   FRAME ERROR CHECK
   ========================================================= */

frameImage.onload = () => {
    console.log(
        "IONES frame loaded:",
        frameImage.width,
        "x",
        frameImage.height
    );
};

frameImage.onerror = () => {
    console.error(
        "frame.png could not be loaded."
    );

    alert(
        "frame.png could not be loaded.\n\n" +
        "Please make sure frame.png is in the same folder " +
        "as index.html."
    );
};
