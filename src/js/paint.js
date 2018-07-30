import Rectangle from './rectangle'
import Simulator from './simulator'
import Brush from './brush'
import WrappedGL from './wrappedgl'
import Utilities from './utilities'

const INTERACTION_MODE = {
  NONE: 0,
  PAINTING: 1,
  RESIZING: 2,
  PANNING: 3
}
const COLOR_MODEL = {
  RYB: 'RYB',
  RGB: 'RGB'
}
const QUALITIES = [
  {
    name: 'Low',
    resolutionScale: 0.1
  },
  {
    name: 'Medium',
    resolutionScale: 1.5
  },
  {
    name: 'High',
    resolutionScale: 2.0
  }
]

const INITIAL_PADDING = 0
const MIN_PAINTING_WIDTH = 300
const MAX_PAINTING_WIDTH = 4096 //this is further constrained by the maximum texture size

const Z_THRESHOLD = 0.13333 //this is scaled with the brushScale

//for thin brush (fewest bristles)
const THIN_MIN_ALPHA = 0.002
const THIN_MAX_ALPHA = 0.08

//for thick brush (most bristles)
const THICK_MIN_ALPHA = 0.002
const THICK_MAX_ALPHA = 0.025

const RESIZING_RADIUS = 20
const RESIZING_FEATHER_SIZE = 200 //in pixels

const Paint = function (canvas, wgl, props) {
  this.canvas = canvas;
  this.wgl = wgl;

  this.props = Object.assign(props, {})

  wgl.getExtension('OES_texture_float');
  wgl.getExtension('OES_texture_float_linear');

  WrappedGL.loadTextFiles([
      'splat.vert', 'splat.frag',
      'fullscreen.vert',
      'advect.frag',
      'divergence.frag',
      'jacobi.frag',
      'subtract.frag',
      'resize.frag',

      'project.frag',
      'distanceconstraint.frag',
      'planeconstraint.frag',
      'bendingconstraint.frag',
      'setbristles.frag',
      'updatevelocity.frag',

      'brush.vert', 'brush.frag',
      'painting.vert', 'painting.frag',
      'picker.vert', 'picker.frag',
      'panel.frag',
      'output.frag',
      'shadow.frag',
  ], start.bind(this));

  function start(shaderSources) {

      var maxTextureSize = wgl.getParameter(wgl.MAX_TEXTURE_SIZE);
      this.maxPaintingWidth = Math.min(MAX_PAINTING_WIDTH, maxTextureSize / QUALITIES[QUALITIES.length - 1].resolutionScale);


      this.framebuffer = wgl.createFramebuffer();


      this.paintingProgram = wgl.createProgram(
          shaderSources['painting.vert'], shaderSources['painting.frag']);

      this.paintingProgramRGB = wgl.createProgram(
          shaderSources['painting.vert'], '#define RGB \n ' + shaderSources['painting.frag']);

      this.resizingPaintingProgram = wgl.createProgram(
          shaderSources['painting.vert'], '#define RESIZING \n ' + shaderSources['painting.frag']);

      this.resizingPaintingProgramRGB = wgl.createProgram(
          shaderSources['painting.vert'], '#define RESIZING \n #define RGB \n ' + shaderSources['painting.frag']);

      this.savePaintingProgram = wgl.createProgram(
          shaderSources['painting.vert'], '#define SAVE \n ' + shaderSources['painting.frag']);

      this.savePaintingProgramRGB = wgl.createProgram(
          shaderSources['painting.vert'], '#define SAVE \n #define RGB \n ' + shaderSources['painting.frag']);

      this.brushProgram = wgl.createProgram(
          shaderSources['brush.vert'], shaderSources['brush.frag'], { 'a_position': 0 });

      this.panelProgram = wgl.createProgram(
          shaderSources['fullscreen.vert'], shaderSources['panel.frag'], { 'a_position': 0 });

      this.outputProgram = wgl.createProgram(
          shaderSources['fullscreen.vert'], shaderSources['output.frag'], { 'a_position': 0 });

      this.shadowProgram = wgl.createProgram(
          shaderSources['fullscreen.vert'], shaderSources['shadow.frag'], { 'a_position': 0 });


      this.quadVertexBuffer = wgl.createBuffer();
      wgl.bufferData(this.quadVertexBuffer, wgl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), wgl.STATIC_DRAW);

      const bounds = canvas.getBoundingClientRect()

      canvas.width = bounds.width;
      canvas.height = bounds.height;



      //position of painting on screen, and its dimensions
      //units are pixels
      this.paintingRectangle = new Rectangle(
          INITIAL_PADDING, INITIAL_PADDING,
          Utilities.clamp(canvas.width - INITIAL_PADDING * 2, MIN_PAINTING_WIDTH, this.maxPaintingWidth),
          Utilities.clamp(canvas.height - INITIAL_PADDING * 2, MIN_PAINTING_WIDTH, this.maxPaintingWidth));

      //simulation resolution = painting resolution * resolution scale
      this.resolutionScale = this.props.quality;


      this.simulator = new Simulator(wgl, shaderSources, this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight());


      this.snapshots = [];
      for (var i = 0; i < this.props.historySize; ++i) { //we always keep around this.props.historySize snapshots to avoid reallocating textures
          var texture = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight(), null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

          wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, texture, 0);
          wgl.clear(wgl.createClearState().bindFramebuffer(this.framebuffer), wgl.COLOR_BUFFER_BIT);

          this.snapshots.push(new Snapshot(texture, this.paintingRectangle.width, this.paintingRectangle.height, this.resolutionScale));
      }


      this.snapshotIndex = 0; //while not undoing, the next snapshot index we'd save into; when undoing, our current position in the snapshots - undo to snapshotIndex - 1, redo to snapshotIndex + 1

      this.undoing = false;
      this.maxRedoIndex = 0; //while undoing, the maximum snapshot index that can be applied



      this.brushInitialized = false; //whether the user has moved their mouse at least once and we thus have a valid brush position

      this.brushX = 0;
      this.brushY = 0;

      this.brushScale = this.props.brushScale * 100;

      this.brushColorHSVA = this.props.color;


      this.colorModel = this.props.colorModel;

      this.needsRedraw = true; //whether we need to redraw the painting


      this.brush = new Brush(wgl, shaderSources, this.props.maxBristleCount);


      this.mainProjectionMatrix = makeOrthographicMatrix(new Float32Array(16), 0.0, this.canvas.width, 0, this.canvas.height, -5000.0, 5000.0);


      this.onResize = function () {
          const bounds = canvas.getBoundingClientRect()

          this.canvas.width = bounds.width;
          this.canvas.height = bounds.height;

          this.paintingRectangle.left = Utilities.clamp(this.paintingRectangle.left, -this.paintingRectangle.width, this.canvas.width);
          this.paintingRectangle.bottom = Utilities.clamp(this.paintingRectangle.bottom, -this.paintingRectangle.height, this.canvas.height);


          //this.colorPicker.bottom = this.canvas.height - COLOR_PICKER_TOP;


          //this.brushViewer.bottom = this.canvas.height - 800;


          this.mainProjectionMatrix = makeOrthographicMatrix(new Float32Array(16), 0.0, this.canvas.width, 0, this.canvas.height, -5000.0, 5000.0);

          this.canvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
          this.tempCanvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
          this.blurredCanvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);


          this.needsRedraw = true;
      };
      this.onResize();

      window.addEventListener('resize', this.onResize.bind(this));


      this.mouseX = 0;
      this.mouseY = 0;

      this.spaceDown = false;

      if (this.props.bindMouseEvents) {
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('mouseover', this.onMouseOver.bind(this));


        document.addEventListener('keydown', (function (event) {
            if (event.keyCode === 32) { //space
                this.spaceDown = true;
            } else if (event.keyCode === 90) { //z
                this.undo();
            } else if (event.keyCode === 82) { //r
                this.redo();
            }
        }).bind(this));

        document.addEventListener('keyup', (function (event) {
            if (event.keyCode === 32) {
                this.spaceDown = false;
            }
        }).bind(this));


        canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
        canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
        canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
        canvas.addEventListener('touchcancel', this.onTouchCancel.bind(this));
      }

      //this is updated during resizing according to the new mouse position
      //when we finish resizing, we then resize the simulator to match
      this.newPaintingRectangle = null;


      this.interactionState = INTERACTION_MODE.NONE;


      var update = (function () {
          this.update();
          requestAnimationFrame(update);
      }).bind(this);
      update();
  }
}

function pascalRow (n) {
    var line = [1];
    for (var k = 0; k < n; ++k) {
        line.push(line[k] * (n - k) / (k + 1));
    }
    return line;
}

function hsvToRyb (h, s, v) {
    h = h % 1;

    var c = v * s,
        hDash = h * 6;

    var x = c * (1 - Math.abs(hDash % 2 - 1));

    var mod = Math.floor(hDash);

    var r = [c, x, 0, 0, x, c][mod],
        g = [x, c, c, x, 0, 0][mod],
        b = [0, 0, x, c, c, x][mod];

    var m = v - c;

    r += m;
    g += m;
    b += m;

    return [r, g, b];
}

function makeOrthographicMatrix (matrix, left, right, bottom, top, near, far) {
    matrix[0] = 2 / (right - left);
    matrix[1] = 0;
    matrix[2] = 0;
    matrix[3] = 0;
    matrix[4] = 0;
    matrix[5] = 2 / (top - bottom);
    matrix[6] = 0;
    matrix[7] = 0;
    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = -2 / (far - near);
    matrix[11] = 0;
    matrix[12] = -(right + left) / (right - left);
    matrix[13] = -(top + bottom) / (top - bottom);
    matrix[14] = -(far + near) / (far - near);
    matrix[15] = 1;

    return matrix;
}

function mix (a, b, t) {
    return (1.0 - t) * a + t * b;
}

//the texture is always updated to be (paintingWidth x paintingHeight) x resolutionScale
function Snapshot (texture, paintingWidth, paintingHeight, resolutionScale) {
    this.texture = texture;
    this.paintingWidth = paintingWidth;
    this.paintingHeight = paintingHeight;
    this.resolutionScale = resolutionScale;
}

Snapshot.prototype.getTextureWidth = function () {
    return Math.ceil(this.paintingWidth * this.resolutionScale);
};

Snapshot.prototype.getTextureHeight = function () {
    return Math.ceil(this.paintingHeight * this.resolutionScale);
};

Paint.prototype.getPaintingResolutionWidth = function () {
    return Math.ceil(this.paintingRectangle.width * this.resolutionScale);
};

Paint.prototype.getPaintingResolutionHeight = function () {
    return Math.ceil(this.paintingRectangle.height * this.resolutionScale);
};

Paint.prototype.update = function () {
    var wgl = this.wgl;
    var canvas = this.canvas;
    var simulationFramebuffer = this.simulationFramebuffer;

    //update brush
    if (this.brushInitialized) {
        this.brush.update(this.brushX, this.brushY, this.props.brushHeight * this.brushScale, this.brushScale);
    }


    //splat into paint and velocity textures

    if (this.interactionState === INTERACTION_MODE.PAINTING) {
        var splatRadius = this.props.splatRadius * this.brushScale;

        var splatColor = hsvToRyb(this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]);

        var alphaT = this.brushColorHSVA[3];

        //we scale alpha based on the number of bristles
        var bristleT = (this.brush.bristleCount - this.props.minBristleCount) / (this.props.maxBristleCount - this.props.minBristleCount);

        var minAlpha = mix(THIN_MIN_ALPHA, THICK_MIN_ALPHA, bristleT);
        var maxAlpha = mix(THIN_MAX_ALPHA, THICK_MAX_ALPHA, bristleT);

        var alpha = mix(minAlpha, maxAlpha, alphaT);

        splatColor[3] = alpha;

        var splatVelocityScale = this.props.splatVelocityScale * splatColor[3] * this.resolutionScale;

        //splat paint
        this.simulator.splat(this.brush, Z_THRESHOLD * this.brushScale, this.paintingRectangle, splatColor, splatRadius, splatVelocityScale);

    }

    var simulationUpdated = this.simulator.simulate();

    if (simulationUpdated) this.needsRedraw = true;


    //the rectangle we end up drawing the painting into
    var clippedPaintingRectangle = (this.interactionState === INTERACTION_MODE.RESIZING ? this.newPaintingRectangle : this.paintingRectangle).clone()
                                       .intersectRectangle(new Rectangle(0, 0, this.canvas.width, this.canvas.height));

    if (this.needsRedraw) {
        //draw painting into texture

        wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.canvasTexture, 0);
        var clearState = wgl.createClearState()
            .bindFramebuffer(this.framebuffer)
            .clearColor(1, 1, 1, 1.0);

        wgl.clear(clearState, wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT);


        var paintingProgram;

        if (this.colorModel === COLOR_MODEL.RYB) {
            paintingProgram = this.interactionState === INTERACTION_MODE.RESIZING ? this.resizingPaintingProgram : this.paintingProgram;
        } else if (this.colorModel === COLOR_MODEL.RGB) {
            paintingProgram = this.interactionState === INTERACTION_MODE.RESIZING ? this.resizingPaintingProgramRGB : this.paintingProgramRGB;
        }
        console.log(this.props.diffuseScale, 'sdfjksfhdsjk')
        var paintingDrawState = wgl.createDrawState()
            .bindFramebuffer(this.framebuffer)
            .vertexAttribPointer(this.quadVertexBuffer, paintingProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0)
            .useProgram(paintingProgram)
            .uniform1f('u_featherSize', RESIZING_FEATHER_SIZE)

            .uniform1f('u_normalScale', this.props.normalScale / this.resolutionScale)
            .uniform1f('u_roughness', this.props.roughness)
              .uniform1f('u_diffuseScale', this.props.diffuseScale)
            .uniform1f('u_specularScale', this.props.specularScale)
            .uniform1f('u_F0', this.props.f0)
            .uniform3f('u_lightDirection', this.props.lightDirection[0], this.props.lightDirection[1], this.props.lightDirection[2])

            .uniform2f('u_paintingPosition', this.paintingRectangle.left, this.paintingRectangle.bottom)
            .uniform2f('u_paintingResolution', this.simulator.resolutionWidth, this.simulator.resolutionHeight)
            .uniform2f('u_paintingSize', this.paintingRectangle.width, this.paintingRectangle.height)
            .uniform2f('u_screenResolution', this.canvas.width, this.canvas.height)
            .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.simulator.paintTexture)

            .viewport(clippedPaintingRectangle.left, clippedPaintingRectangle.bottom, clippedPaintingRectangle.width, clippedPaintingRectangle.height);

        wgl.drawArrays(paintingDrawState, wgl.TRIANGLE_STRIP, 0, 4);

    }

    //output painting to screen
    var outputDrawState = wgl.createDrawState()
      .viewport(0, 0, this.canvas.width, this.canvas.height)
      .useProgram(this.outputProgram)
      .uniformTexture('u_input', 0, wgl.TEXTURE_2D, this.canvasTexture)
      .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0);

    wgl.drawArrays(outputDrawState, wgl.TRIANGLE_STRIP, 0, 4);


    //this.drawShadow(PAINTING_SHADOW_ALPHA, clippedPaintingRectangle); //draw painting shadow

    if (!this.props.bindMouseEvents) {
      // Don't draw brush cursor if mouse events are disabled
      return false
    }

    //draw brush to screen
    if (this.interactionState === INTERACTION_MODE.PAINTING || this.interactionState === INTERACTION_MODE.NONE && this.desiredInteractionMode(this.mouseX, this.mouseY) === INTERACTION_MODE.PAINTING) { //we draw the brush if we're painting or you would start painting on click
        var brushDrawState = wgl.createDrawState()
            .bindFramebuffer(null)
            .viewport(0, 0, this.canvas.width, this.canvas.height)
            .vertexAttribPointer(this.brush.brushTextureCoordinatesBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0)

            .useProgram(this.brushProgram)
            .bindIndexBuffer(this.brush.brushIndexBuffer)

            .uniform4f('u_color', 0.6, 0.6, 0.6, 1.0)
            .uniformMatrix4fv('u_projectionViewMatrix', false, this.mainProjectionMatrix)
            .enable(wgl.DEPTH_TEST)

            .enable(wgl.BLEND)
            .blendFunc(wgl.DST_COLOR, wgl.ZERO)

            .uniformTexture('u_positionsTexture', 0, wgl.TEXTURE_2D, this.brush.positionsTexture);

        wgl.drawElements(brushDrawState, wgl.LINES, this.brush.indexCount * this.brush.bristleCount / this.brush.maxBristleCount, wgl.UNSIGNED_SHORT, 0);
    }


    //work out what cursor we want
    var desiredCursor = '';

    if (this.interactionState === INTERACTION_MODE.NONE) { //if there is no current interaction, we display a cursor based on what interaction would occur on click
        var desiredMode = this.desiredInteractionMode(this.mouseX, this.mouseY);

        if (desiredMode === INTERACTION_MODE.PAINTING) {
            desiredCursor = 'none';
        } else {
            desiredCursor = 'default';
        }
    } else { //if there is an interaction going on, display appropriate cursor
        if (this.interactionState === INTERACTION_MODE.PAINTING) {
            desiredCursor = 'none';
        }
    }

    if (this.canvas.style.cursor !== desiredCursor) { //don't thrash the style
        this.canvas.style.cursor = desiredCursor;
    }
};

Paint.prototype.clear = function () {
    this.simulator.clear();

    this.needsRedraw = true;
};

Paint.prototype.saveSnapshot = function () {
    if (this.snapshotIndex === this.props.historySize) { //no more room in the snapshots
        //the last shall be first and the first shall be last...
        var front = this.snapshots.shift();
        this.snapshots.push(front);

        this.snapshotIndex -= 1;
    }

    this.undoing = false;

    var snapshot = this.snapshots[this.snapshotIndex]; //the snapshot to save into

    if (snapshot.getTextureWidth() !== this.simulator.resolutionWidth || snapshot.getTextureHeight() !== this.simulator.resolutionHeight) { //if we need to resize the snapshot's texture
        this.wgl.rebuildTexture(snapshot.texture, this.wgl.RGBA, this.wgl.FLOAT, this.simulator.resolutionWidth, this.simulator.resolutionHeight, null, this.wgl.CLAMP_TO_EDGE, this.wgl.CLAMP_TO_EDGE, this.wgl.LINEAR, this.wgl.LINEAR);
    }

    this.simulator.copyPaintTexture(snapshot.texture);

    snapshot.paintingWidth = this.paintingRectangle.width;
    snapshot.paintingHeight = this.paintingRectangle.height;
    snapshot.resolutionScale = this.resolutionScale;

    this.snapshotIndex += 1;
};

Paint.prototype.applySnapshot = function (snapshot) {
    this.paintingRectangle.width = snapshot.paintingWidth;
    this.paintingRectangle.height = snapshot.paintingHeight;

    if (this.resolutionScale !== snapshot.resolutionScale) {
        this.resolutionScale = snapshot.resolutionScale;
    }

    if (this.simulator.width !== this.getPaintingResolutionWidth() || this.simulator.height !== this.getPaintingResolutionHeight()) {
        this.simulator.changeResolution(this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight());
    }

    this.simulator.applyPaintTexture(snapshot.texture);
};

Paint.prototype.canUndo = function () {
    return this.snapshotIndex >= 1;
};

Paint.prototype.canRedo = function () {
    return this.undoing && this.snapshotIndex <= this.maxRedoIndex - 1;
};

Paint.prototype.undo = function () {
    if (!this.undoing) {
        this.saveSnapshot();

        this.undoing = true;

        this.snapshotIndex -= 1;

        this.maxRedoIndex = this.snapshotIndex;
    }

    if (this.canUndo()) {
        this.applySnapshot(this.snapshots[this.snapshotIndex - 1]);

        this.snapshotIndex -= 1;
    }

    this.needsRedraw = true;
};

Paint.prototype.redo = function () {
    if (this.canRedo()) {
        this.applySnapshot(this.snapshots[this.snapshotIndex + 1]);

        this.snapshotIndex += 1;

    }

    this.needsRedraw = true;
};

Paint.prototype.save = function () {
    //we first render the painting to a WebGL texture

    var wgl = this.wgl;

    var saveWidth = this.paintingRectangle.width;
    var saveHeight = this.paintingRectangle.height;

    var saveTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, saveWidth, saveHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

    var saveFramebuffer = wgl.createFramebuffer();
    wgl.framebufferTexture2D(saveFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, saveTexture, 0);

    var paintingProgram = this.colorModel === COLOR_MODEL.RYB ? this.savePaintingProgram : this.savePaintingProgramRGB;

    var saveDrawState = wgl.createDrawState()
        .bindFramebuffer(saveFramebuffer)
        .viewport(0, 0, saveWidth, saveHeight)
        .vertexAttribPointer(this.quadVertexBuffer, paintingProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0)
        .useProgram(paintingProgram)
        .uniform2f('u_paintingSize', this.paintingRectangle.width, this.paintingRectangle.height)
        .uniform2f('u_paintingResolution', this.simulator.resolutionWidth, this.simulator.resolutionHeight)
        .uniform2f('u_screenResolution', this.paintingRectangle.width, this.paintingRectangle.height)
        .uniform2f('u_paintingPosition', 0, 0)
        .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.simulator.paintTexture)

        .uniform1f('u_normalScale', this.props.normalScale / this.resolutionScale)
        .uniform1f('u_roughness', this.props.roughness)
        .uniform1f('u_diffuseScale', this.props.diffuseScale)
        .uniform1f('u_specularScale', this.props.specularScale)
        .uniform1f('u_F0', this.props.f0)
        .uniform3f('u_lightDirection', this.props.lightDirection[0], this.props.lightDirection[1], this.props.lightDirection[2]);


    wgl.drawArrays(saveDrawState, wgl.TRIANGLE_STRIP, 0, 4);

    //then we read back this texture

    var savePixels = new Uint8Array(saveWidth * saveHeight * 4);
    wgl.readPixels(wgl.createReadState().bindFramebuffer(saveFramebuffer),
                    0, 0, saveWidth, saveHeight, wgl.RGBA, wgl.UNSIGNED_BYTE, savePixels);


    wgl.deleteTexture(saveTexture);
    wgl.deleteFramebuffer(saveFramebuffer);


    //then we draw the pixels to a 2D canvas and then save from the canvas
    //is there a better way?

    var saveCanvas = document.createElement('canvas');
    saveCanvas.width = saveWidth;
    saveCanvas.height = saveHeight;
    var saveContext = saveCanvas.getContext('2d');

    var imageData = saveContext.createImageData(saveWidth, saveHeight);
    imageData.data.set(savePixels);
    saveContext.putImageData(imageData, 0, 0);

    window.open(saveCanvas.toDataURL());
};

Paint.prototype.desiredInteractionMode = function (mouseX, mouseY) {
  //what interaction mode would be triggered if we clicked with given mouse position
  return INTERACTION_MODE.PAINTING;
};

Paint.prototype.initDraw = function(x, y) {
  var mouseX = x;
  var mouseY = this.canvas.height - y;

  this.mouseX = mouseX;
  this.mouseY = mouseY;

  this.brushX = mouseX;
  this.brushY = mouseY;

  this.interactionState = INTERACTION_MODE.PAINTING
}

Paint.prototype.draw = function(x, y) {
  var mouseX = x;
  var mouseY = this.canvas.height - y;

  //this.brushColorHSVA = [Math.random() * 3, Math.random() * 2.5, Math.random() * 2, 0.8]

  this.brushX = mouseX;
  this.brushY = mouseY;



  if (!this.brushInitialized) {
    this.brush.initialize(this.brushX, this.brushY, this.props.brushHeight * this.brushScale, this.brushScale);

    this.brushInitialized = true;
  }

  this.mouseX = mouseX;
  this.mouseY = mouseY;
}

Paint.prototype.stopDraw = function(x, y) {
  this.interactionState = INTERACTION_MODE.NONE;
}

Paint.prototype.onMouseDown = function (event) {
    if (event.preventDefault) event.preventDefault();
    if ('button' in event && event.button !== 0) return; //only handle left clicks

    var position = Utilities.getMousePosition(event, this.canvas);

    var mouseX = position.x;
    var mouseY = this.canvas.height - position.y;

    this.mouseX = mouseX;
    this.mouseY = mouseY;

    this.brushX = mouseX;
    this.brushY = mouseY;

    //this.colorPicker.onMouseDown(mouseX, mouseY);

  //  if (!this.colorPicker.isInUse()) {
    var mode = this.desiredInteractionMode(mouseX, mouseY);

    if (mode === INTERACTION_MODE.PAINTING) {
      this.interactionState = INTERACTION_MODE.PAINTING;
      this.saveSnapshot();
    }
    //}
};

Paint.prototype.onMouseMove = function (event) {
  if (event.preventDefault) event.preventDefault();

  //this.brushColorHSVA = [Math.random() * 5, Math.random() * 4.5, Math.random() * 2.5, 0.8]

  var position = Utilities.getMousePosition(event, this.canvas);

  var mouseX = position.x;
  var mouseY = this.canvas.height - position.y;

  this.brushX = mouseX;
  this.brushY = mouseY;


  if (!this.brushInitialized) {
    this.brush.initialize(this.brushX, this.brushY, this.props.brushHeight * this.brushScale, this.brushScale);

    this.brushInitialized = true;
  }

  this.mouseX = mouseX;
  this.mouseY = mouseY;
};

Paint.prototype.onMouseUp = function (event) {
  console.log('onMouseUp')
    if (event.preventDefault) event.preventDefault();

    var position = Utilities.getMousePosition(event, this.canvas);

    this.interactionState = INTERACTION_MODE.NONE;
};

Paint.prototype.onMouseOver = function (event) {
    event.preventDefault();

    var position = Utilities.getMousePosition(event, this.canvas);

    var mouseX = position.x;
    var mouseY = this.canvas.height - position.y;

    this.brushX = mouseX;
    this.brushY = mouseY;

    this.brush.initialize(this.brushX, this.brushY, this.props.brushHeight * this.brushScale, this.brushScale);
    this.brushInitialized = true;
};

Paint.prototype.onTouchStart = function (event) {
    event.preventDefault();

    if (event.touches.length === 1) { //if this is the first touch

        this.onMouseDown(event.targetTouches[0]);

        //if we've just started painting then we need to initialize the brush at the touch location
        if (this.interactionState === INTERACTION_MODE.PAINTING) {
            this.brush.initialize(this.brushX, this.brushY, this.props.brushHeight * this.brushScale, this.brushScale);
            this.brushInitialized = true;
        }
    }
};

Paint.prototype.onTouchMove = function (event) {
    event.preventDefault();

    this.onMouseMove(event.targetTouches[0]);
};

Paint.prototype.onTouchEnd = function (event) {
    event.preventDefault();

    if (event.touches.length > 0) return; //don't fire if there are still touches remaining

    this.onMouseUp({});
};

Paint.prototype.onTouchCancel = function (event) {
    event.preventDefault();

    if (event.touches.length > 0) return; //don't fire if there are still touches remaining

    this.onMouseUp({});
};

export default Paint
