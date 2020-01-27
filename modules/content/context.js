import { mat4 } from 'gl-matrix';
let cubeRotation = 0.0;
let inVR = false;
let vrDisplay;
let viewPosition = [0, 0, -5];
let worldCameraPosition = [0, 0, -2.5];
let buffers = [];
export default function createContext(canvas, initBuffers, initShaders) {
    const gl = (canvas.getContext('webgl2') || canvas.getContext('experimental-webgl'));
    // If we don't have a GL context, give up now
    if (!gl) {
        window.alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }
    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaders(gl);
    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    buffers.push(initBuffers(gl));
    let then = 0;
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    const nonVRCallback = (now) => {
        if (inVR) {
            return;
        }
        else {
            // Draw the scene repeatedly, if using normal webgl
            now *= 0.001; // convert to seconds
            const deltaTime = now - then;
            then = now;
            render(canvas, gl, shaderProgram, buffers, deltaTime);
            window.requestAnimationFrame(nonVRCallback);
        }
    };
    const vrCallback = (now) => {
        if (vrDisplay == null || !inVR) {
            return;
        }
        // reregister callback if we're still in VR
        vrDisplay.requestAnimationFrame(vrCallback);
        // calculate time delta for rotation
        now *= 0.001; // convert to seconds
        const deltaTime = now - then;
        then = now;
        // render scene
        renderVR(canvas, gl, shaderProgram, buffers, deltaTime);
    };
    // register callback
    // Ensure VR is all set up
    vrSetup(canvas, gl, shaderProgram, buffers, nonVRCallback, vrCallback);
    // Start rendering
    window.requestAnimationFrame(nonVRCallback);
    window.vrButton = document.createElement('button');
    window.vrButton.innerHTML = 'Enter VR';
    window.vrButton.onclick = function enterVR() {
        console.log('Enter VR');
        if (vrDisplay != null) {
            inVR = true;
            // hand the canvas to the WebVR API
            vrDisplay.requestPresent([{ source: canvas }]);
            // requestPresent() will request permission to enter VR mode,
            // and once the user has done this our `vrdisplaypresentchange`
            // callback will be triggered
        }
    };
    window.vrButton.style = 'position: absolute; bottom: 20px; right:50px;';
    window.document.body.append(window.vrButton);
    return { gl, updateContext };
}
function updateContext(gl, contextProperties) {
    for (const prop in contextProperties) {
        if (prop === 'buffers' && contextProperties['buffers'].length > 0) {
            buffers = [];
            for (const buffer of contextProperties['buffers']) {
                buffers.push(buffer(gl));
            }
        }
        if (prop === 'viewPosition' && !!Array.isArray(contextProperties['viewPosition'])) {
            const vp = contextProperties['viewPosition'];
            if ('cameraDelta' in contextProperties && !!Array.isArray(contextProperties['cameraDelta'])) {
                const wcd = contextProperties['cameraDelta'];
                wcd.forEach((v, i, a) => {
                    if (!!vp[i]) {
                        if (viewPosition[i] < vp[i]) { // Don't go closer than specified worldCameraPosition
                            viewPosition[i] = (viewPosition[i] + v);
                        }
                        else {
                            viewPosition[i] = vp[i];
                        }
                    }
                    else {
                        viewPosition[i] = (viewPosition[i] + v);
                    }
                });
                // console.log("Move view", viewPosition);
            }
            else {
                vp.forEach((v, i, a) => viewPosition[i] = v);
            }
        }
        else if (prop === 'viewPosition') {
            viewPosition = contextProperties['viewPosition'];
            // console.log("Hold position");
        }
        if (prop === 'worldCameraPosition' && !!Array.isArray(contextProperties['worldCameraPosition'])) {
            const wcp = contextProperties['worldCameraPosition'];
            if ('cameraDelta' in contextProperties && !!Array.isArray(contextProperties['cameraDelta'])) {
                const wcd = contextProperties['cameraDelta'];
                wcd.forEach((v, i, a) => {
                    if (!!wcp[i]) {
                        if (worldCameraPosition[i] < wcp[i]) { // Don't go closer than specified worldCameraPosition
                            worldCameraPosition[i] = (worldCameraPosition[i] + v);
                        }
                        else {
                            worldCameraPosition[i] = wcp[i];
                        }
                    }
                    else {
                        worldCameraPosition[i] = (worldCameraPosition[i] + v);
                    }
                });
                // console.log("Move camera", worldCameraPosition);
            }
            else {
                wcp.forEach((v, i, a) => worldCameraPosition[i] = v);
            }
        }
    }
}
// entry point for non-WebVR rendering
// called by whatever mechanism (likely keyboard/mouse events)
// you used before to trigger redraws
function render(canvas, gl, shaderProgram, buffers, deltaTime) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Clear everything
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things
    // Clear the canvas before we start drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.
    const fieldOfView = 45 * Math.PI / 180; // in radians
    const aspect = canvas.width / canvas.height;
    const zNear = 1; // 0.1;
    const zFar = 2000; // 100.0;
    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    const projectionMatrix = mat4.perspective(mat4.create(), fieldOfView, aspect, zNear, zFar);
    drawScene(gl, shaderProgram, buffers, projectionMatrix, null, deltaTime);
}
// entry point for WebVR, called by vrCallback()
function renderVR(canvas, gl, shaderProgram, buffers, deltaTime) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Clear everything
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things
    renderEye(canvas, gl, shaderProgram, buffers, true, deltaTime);
    renderEye(canvas, gl, shaderProgram, buffers, false, deltaTime);
    vrDisplay.submitFrame();
}
function renderEye(canvas, gl, shaderProgram, buffers, isLeft, deltaTime) {
    let width = canvas.width;
    let wD2 = canvas.width / 2;
    let height = canvas.height;
    let projection, view;
    let frameData = new VRFrameData();
    vrDisplay.getFrameData(frameData);
    // choose which half of the canvas to draw on
    if (isLeft) {
        gl.viewport(0, 0, wD2, height);
        projection = frameData.leftProjectionMatrix;
        view = frameData.leftViewMatrix;
    }
    else {
        gl.viewport(wD2, 0, wD2, height);
        projection = frameData.rightProjectionMatrix;
        view = frameData.rightViewMatrix;
    }
    // we don't want auto-rotation in VR mode, so we directly
    // use the view matrix
    drawScene(gl, shaderProgram, buffers, projection, view, deltaTime);
}
//
// Draw the scene.
//
function drawScene(gl, shaderProgram, buffers, projectionMatrix, view = null, deltaTime) {
    cubeRotation += deltaTime;
    const cameraPosition = (viewPosition !== null) ?
        viewPosition :
        [0, 0, worldCameraPosition[2] / 1.5];
    const target = [0, 0, 0];
    const up = [0, 1, 0];
    // Compute the camera's matrix using look at.
    const cameraMatrix = mat4.lookAt(mat4.create(), cameraPosition, target, up);
    // Make a view matrix from the camera matrix.
    const viewMatrix = mat4.invert(mat4.create(), cameraMatrix);
    const worldMatrix = mat4.create();
    if (view !== null) {
        // Premultiply the view matrix
        mat4.multiply(viewMatrix, view, viewMatrix);
    }
    if (buffers.length > 0) {
        let b = 0;
        for (const buffer of buffers) {
            // console.log('Frame ', deltaTime, ': buffer ', ++b);
            // buffer: {
            //     position: WebGLBuffer, positionSize: number,
            //     normal: WebGLBuffer, normalSize: number,
            //     index: WebGLBuffer, indexSize: number,
            //     color: WebGLBuffer , colorSize: number
            // }
            // Collect all the info needed to use the shader program.
            // Look up which attributes our shader program is using
            // for aVertexPosition, aVevrtexColor and also
            // look up uniform locations.
            const program = (!!buffer['program']) ? buffer['program'] : shaderProgram;
            const programInfo = {
                program: program,
                attribLocations: {
                    vertexNormal: gl.getAttribLocation(program, 'aVertexNormal'),
                    vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
                    vertexColor: gl.getAttribLocation(program, 'aVertexColor'),
                },
                uniformLocations: {
                    projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
                    modelViewMatrix: gl.getUniformLocation(program, 'uModelViewMatrix'),
                    normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
                    worldMatrix: gl.getUniformLocation(program, "uWorldMatrix"),
                    textureLocation: gl.getUniformLocation(program, "uTexture"),
                    worldCameraPositionLocation: gl.getUniformLocation(program, "uWorldCameraPosition")
                },
            };
            // Tell WebGL to use our program when drawing
            gl.useProgram(programInfo.program);
            // Tell WebGL how to pull out the colors from the color buffer
            // into the vertexColor attribute.
            {
                const numComponents = 4;
                const type = gl.FLOAT;
                const normalize = false;
                const stride = 0;
                const offset = 0;
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer['color']);
                gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, type, normalize, stride, offset);
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
            }
            // Tell WebGL how to pull out the positions from the position
            // buffer into the vertexPosition attribute
            {
                const numComponents = 3;
                const type = gl.FLOAT;
                const normalize = false;
                const stride = 0;
                const offset = 0;
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer['position']);
                gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
            }
            // Tell WebGL how to pull normals out of normalBuffer (ARRAY_BUFFER)
            {
                const numComponents = 3; // 3 components per iteration
                const type = gl.FLOAT; // the data is 32bit floating point values
                const normalize = false; // normalize the data (convert from 0-255 to 0-1)
                const stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
                const offset = 0; // start at the beginning of the buffer
                gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
                // Bind the normal buffer.
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer['normal']);
                gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, type, normalize, stride, offset);
            }
            // Animate the rotation
            if (!!buffer['rotation'] && buffer['rotation'].length === 3) {
                const modelXRotationRadians = cubeRotation * buffer['rotation'][0];
                const modelYRotationRadians = cubeRotation * buffer['rotation'][1];
                const modelZRotationRadians = cubeRotation * buffer['rotation'][2];
                mat4.rotateX(worldMatrix, worldMatrix, modelXRotationRadians);
                mat4.rotateY(worldMatrix, worldMatrix, modelYRotationRadians);
                mat4.rotateZ(worldMatrix, worldMatrix, modelZRotationRadians);
            }
            else if (buffer.length > 1 && b === 1) {
                // For some reason texture(uTexture, direction) is upside-down
                mat4.rotateZ(worldMatrix, worldMatrix, Math.PI / 2);
            }
            // Set the uniforms
            gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
            gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, viewMatrix);
            gl.uniformMatrix4fv(programInfo.uniformLocations.worldMatrix, false, worldMatrix);
            // Set the drawing position to the "identity" point, which is
            // the center of the scene.
            gl.uniform3fv(programInfo.uniformLocations.worldCameraPositionLocation, worldCameraPosition);
            // Tell the shader to use texture unit 0 for u_texture
            gl.uniform1i(programInfo.uniformLocations.textureLocation, 0);
            // gl.drawArrays(gl.TRIANGLES, 0, buffer['positionSize'] / 3);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer['index']);
            gl.drawElements(gl.TRIANGLES, buffer['indexSize'], gl.UNSIGNED_SHORT, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
    }
}
// Set up the VR display and callbacks
function vrSetup(canvas, gl, programInfo, buffers, noVRRender, vrCallback) {
    if (typeof navigator.getVRDisplays !== 'function') {
        window.alert("Your browser does not support WebVR");
        return;
    }
    navigator.getVRDisplays().then(displays => {
        if (displays !== null && displays.length > 0) {
            // Assign last returned display to vrDisplay
            vrDisplay = displays[displays.length - 1];
            // optional, but recommended
            vrDisplay.depthNear = 0.1;
            vrDisplay.depthFar = 100.0;
        }
    });
    window.addEventListener('vrdisplaypresentchange', () => {
        // Are we entering or exiting VR?
        if (vrDisplay != null && vrDisplay.isPresenting) {
            // We should make our canvas the size expected
            // by WebVR
            const eye = vrDisplay.getEyeParameters("left");
            // multiply by two since we're rendering both eyes side
            // by side
            canvas.width = eye.renderWidth * 2;
            canvas.height = eye.renderHeight;
            vrDisplay.requestAnimationFrame(vrCallback);
        }
        else if (vrDisplay !== null) {
            console.log('Exit VR');
            inVR = false;
            canvas.width = 640;
            canvas.height = 480;
            window.requestAnimationFrame(noVRRender);
        }
    });
}
//# sourceMappingURL=context.js.map