<template>
  <canvas />
</template>

<script>
import map from '../js/map'
import WrappedGL from '../js/wrappedgl'
import Paint from '../js/paint'

import props from '../js/props'

export default {
  name: 'Paint',
  props: {
    ...props
  },
  methods: {
    clear () {
      this.painter.clear()
    },
    rgba2hsva(rgba) {
      var r = rgba[0]/255,
          g = rgba[1]/255,
          b = rgba[2]/255;

      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var delta = max - min;

      var h = 0;
      var s = max === 0 ? 0 : delta / max;
      var v = max;

      if (max === min) {
          h = 0; // achromatic
      } else {
          switch (max) {
              case r: h = (g < b ? 6 : 0) + (g - b) / delta;
                  break;
              case g: h = 2 + (b - r) / delta;
                  break;
              case b: h = 4 + (r - g) / delta;
                  break;
          }
          h *= 60;
      }
     return [ h, s, v, rgba[3] ];
    }
  },
  computed: {
    _brushScale () {
      return Math.floor(map(this.brushScale, 0, 1, this.minBrushScale, this.maxBrushScale))
    },
    _bristleCount () {
      return Math.floor(map(this.bristleCount, 0, 1, this.minBristleCount, this.maxBristleCount))
    },
    _color () {
      return this.rgba2hsva(this.color)
    }
  },
  watch: {
    '$props': {
      handler (old, mutation) {
        for (let prop in props) {
          if (this.painter.props.hasOwnProperty(prop)) {
            this.painter.props[prop] = this.$props[prop]
          }
        }
      },
      deep: true
    },
    _color () {
      this.painter.brushColorHSVA = this._color
    },
    _bristleCount () {
      this.painter.brush.setBristleCount(this._bristleCount)
    },
    _brushScale () {
      this.painter.brushScale = this._brushScale
    },
    fluidity () {
      this.painter.simulator.fluidity = this.fluidity
    },
    colorModel () {
      this.painter.colorModel = this.colorModel
    },
    quality () {
      this.painter.resolutionScale = this.quality
    },
    playing () {
      this.playing ? this.painter.play() : this.painter.pause()
    },
    position () {
      this.painter.draw(this.position.x, this.position.y)
    }
  },
  mounted () {
    const canvas = this.$el
    const wgl = WrappedGL.create(canvas)

    if (wgl !== null && wgl.hasFloatTextureSupport()) {
      this.painter = new Paint(canvas, wgl, this.$props);
    }
  }
}
</script>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
}
</style>
