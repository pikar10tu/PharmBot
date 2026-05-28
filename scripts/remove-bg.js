const { Jimp } = require('jimp');
const path = require('path');

const files = ['patient-idle', 'patient-speak'];

async function removeBg(name) {
  const src = path.join(__dirname, `../img/${name}.jpg`);
  const dst = path.join(__dirname, `../img/${name}.png`);

  const img = await Jimp.read(src);
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    if (r > 230 && g > 230 && b > 230) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
  await img.write(dst);
  console.log(`✓ ${dst}`);
}

(async () => {
  for (const f of files) await removeBg(f);
  console.log('Done.');
})();
