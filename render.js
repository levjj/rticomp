/*
 * NodeJS Script to render RTI images to PNG.
 *
 * Authors: Christopher Schuster, Wei Liao
 * Date: Feb 3, 2014
*/

var fs   = require('fs'),
    PNG  = require('pngjs').PNG,
    ARGV = require('optimist')
          .usage('Render an RTI or PTM image.\nUsage: $0')
          .demand('i')
          .alias('i', 'input')
          .describe('i', 'Input RTI or PTM file')
          .demand('o')
          .alias('o', 'output')
          .describe('o', 'Output PNG image')
          .describe('lx', 'X coodinate of light position')
          .default('lx', 0.0)
          .describe('ly', 'X coodinate of light position')
          .default('ly', 0.0)
          .argv;

// Defines
var PI = Math.PI;
var zerotol = 1e-5;
var kr = 0.9;
var radius = 100;

// Controlors
var g_IsDiffuse = false; //$("input#diffuse")[0].checked;
var g_IsSpecular = false; //$("input#specular")[0].checked;

// Viewer Parameters
var g_ViewerWidth = 320;
var g_ViewerHeight = 470;
var mousedown_image = false;
var g_OldX = 0.0;
var g_OldY = 0.0;
var g_AutoScale = true;

// Data Parameters
var g_FileName = "";
var g_FileExtension = "";
var g_RawDataWidth;
var g_DataWidth;
var g_RawDataHeight;
var g_DataHeight;
var g_DataDepth; // The total size of an image is (width * height * depth)
var g_Dimension;
var g_Terms;
var g_BasicType;
var g_ElementSize;
var g_RawPixels = null;
var g_Pixels = null;
var g_ImgData = null;
var g_NormalMap = null;

// Compass Parameters
var light = new Array(ARGV.lx, ARGV.ly, 1.0);

// Tool Functions
function getMin(a, b) {
    if (a < b) return a;
    else return b;
}

function getMax(a, b) {
    if (a > b) return a;
    else return b;
}

function limit(value, down, up) {
    return (getMax(down, getMin(up, value)));
}

function normalize(vector) {
    var s = 0;
    for (var i = 0; i < vector.length; ++i) {
        s += vector[i] * vector[i];
    }
    var ret = new Array(vector.length);
    for (var i = 0; i < vector.length; ++i) {
        ret[i] = vector[i] / s;
    }
    return ret;
}

function add(a, b) {
    if (a.length != b.length) {
        alert("Addtion error");
        return null;
    }
    var ret = new Array(a.length);
    for (var i = 0; i < a.length; ++i) {
        ret[i] = a[i] + b[i];
    }
    return ret;
}

function subtract(a, b) {
    if (a.length != b.length) {
        alert("Subtraction error");
        return null;
    }
    var ret = new Array(a.length);
    for (var i = 0; i < a.length; ++i) {
        ret[i] = a[i] - b[i];
    }
    return ret;
}

function divide(vector, d) {
    if (d == 0) {
        alert("divisor is zero!");
        return null;
    }
    var ret = new Array(vector.length);
    for (var i = 0; i < vector.length; ++i) {
        ret[i] = vector[i] / d;
    }
    return ret;
}

function multiply(a, b) {
    if (a.length != b.length) {
        alert("Multiplication error");
        return null;
    }
    var ret = 0;
    for (var i = 0; i < a.length; ++i) {
        ret += a[i] * b[i];
    }
    return ret;
}

function calcuLightPos() {
    var sx = light[0]*light[0];
    var sy = light[1]*light[1];
    var sr = radius*radius;
    if (sx+sy > sr) {
        var scale = Math.sqrt(sr/(sx+sy));
        light[0] = light[0] * scale;
        light[1] = light[1] * scale;
    }
    light[0] = kr * (light[0] / radius);
    light[1] = kr * (light[1] / radius);
    light[2] = Math.sqrt(getMax(1 - light[0]*light[0] - light[1]*light[1], 0.0));
}

function Bytes2Float32(bytes) {
    var sign = (bytes & 0x80000000) ? -1 : 1;
    var exponent = ((bytes >> 23) & 0xFF) - 127;
    var significand = (bytes & ~(-1 << 23));

    if (exponent == 128)
        return sign * ((significand) ? Number.NaN : Number.POSITIVE_INFINITY);
    if (exponent == -127) {
        if (significand == 0)
            return sign * 0.0;
        exponent = -126;
        significand /= (1 << 22);
    } else {
        significand = (significand | (1 << 23)) / (1 << 23);
    }

    return sign * significand * Math.pow(2, exponent);
}

function getScaleTable(srcLength, desLength) {
    // TODO: can be shorter
    var array = new Array(desLength);
    var src = 0;
    var des = 0;
    var srcdis = srcLength;
    var desdis = desLength;
    var dis = (srcLength < desLength) ? desLength : srcLength;
    for (var i = 0; i < dis; ++i) {
        array[des] = src;
        srcdis += srcLength;
        desdis += desLength;
        if (srcdis > dis) {
            ++src;
            srcdis -= dis;
        }
        if (desdis > dis) {
            ++des;
            desdis -= dis;
        }
    }
    return array;
}

function getScale(srcWidth, srcHeight, desWidth, desHeight) {
    if (desHeight <= 0 || desWidth <= 0 || srcHeight <= 0 || srcWidth <= 0) {
        alert("Error: Wrong Scale Size!");
        return -1;
    }

    // auto scale
    var scale = desWidth / srcWidth;
    var tmp = desHeight / srcHeight;
    if (tmp < scale)
        scale = tmp;

    return scale;
}

/**
 * src_pixels: source image data
 * dataWidth: the width of source image data
 * srcX: X value of the left upper point in the source image
 * srcY: Y value of the left upper point in the source image
 * partWidth: the width of the part of source image
 * partHeight: the height of the part of source image
 * desWidth: the width of destination image
 * desHeight: the height of destination iamge
 *
 * return: the new scaled image data
 */
function autoScale(src_pixels, dataWidth, srcX, srcY, partWidth, partHeight, desWidth, desHeight) {
    var des_pixels = null;

    if (desHeight <= 0 || desWidth <= 0 || partHeight <= 0 || partWidth <= 0) {
        alert("Error: Wrong Scale Size!");
        return des_pixels;
    }

    // scale table
    var tabWidth = getScaleTable(partWidth, desWidth);
    var tabHeight = getScaleTable(partHeight, desHeight);

    // simple jump
    des_pixels = new Array(desWidth * desHeight * g_DataDepth);
    tmp = 0;
    for (var i = 0; i < desHeight; ++i) {
        var sum = (tabHeight[i] + srcY) * dataWidth;
        for (var j = 0; j < desWidth; ++j) {
            var offset = (sum + tabWidth[j] + srcX) * g_DataDepth;
            for (var k = 0; k < g_DataDepth; ++k) {
                des_pixels[tmp++] = src_pixels[offset + k];
            }
        }
    }

    return des_pixels;
}

function loadFile(filename, cb) {
    g_FileName = filename;
    g_FileExtension = g_FileName.substring(g_FileName.lastIndexOf('.')+1).trim();

    function onload(raw_file) {
        var raw_pixels = null;
        switch (g_FileExtension) {
            case "rti":
                raw_pixels = loadHSH(raw_file);
                break;
            case "ptm":
                raw_pixels = loadPTM(raw_file);
                break;
            default:
                alert("Error: undefined file extension!");
                return null;
        }
        g_RawPixels = raw_pixels;
        g_RawDataWidth = g_DataWidth;
        g_RawDataHeight = g_DataHeight;
        if (g_AutoScale) {
            // calculate scale
            var scale = getScale(g_DataWidth, g_DataHeight, g_ViewerWidth, g_ViewerHeight);
            g_DataWidth = Math.round(g_RawDataWidth * scale);
            g_DataHeight = Math.round(g_RawDataHeight * scale);

            // scale raw image
            raw_pixels = autoScale(raw_pixels, g_RawDataWidth, 0, 0,
                                               g_RawDataWidth, g_RawDataHeight,
                                               g_DataWidth, g_DataHeight);
        }
        g_Pixels = raw_pixels;
        cb(raw_pixels);
    }
    fs.readFile(filename, {encoding: 'binary'}, function(err,data) {
        if (err) throw err;
        onload(data);
    });
}

// Render the image using data in HSH file
function renderImageHSH() {
    var weights = new Array();
    var phi = Math.atan2(light[1], light[0]);
    if (phi < 0) phi += 2*PI;
    var theta = Math.acos(light[2]);
    
    weights[0] = 1/Math.sqrt(2*PI);
    weights[1]  = Math.sqrt(6/PI)      *  (Math.cos(phi)*Math.sqrt(Math.cos(theta)-Math.cos(theta)*Math.cos(theta)));
    weights[2]  = Math.sqrt(3/(2*PI))  *  (-1 + 2*Math.cos(theta));
    weights[3]  = Math.sqrt(6/PI)      *  (Math.sqrt(Math.cos(theta) - Math.cos(theta)*Math.cos(theta))*Math.sin(phi));

    weights[4]  = Math.sqrt(30/PI)     *  (Math.cos(2*phi)*(-Math.cos(theta) + Math.cos(theta)*Math.cos(theta)));
    weights[5]  = Math.sqrt(30/PI)     *  (Math.cos(phi)*(-1 + 2*Math.cos(theta))*Math.sqrt(Math.cos(theta) - Math.cos(theta)*Math.cos(theta)));
    weights[6]  = Math.sqrt(5/(2*PI))  *  (1 - 6*Math.cos(theta) + 6*Math.cos(theta)*Math.cos(theta));
    weights[7]  = Math.sqrt(30/PI)     *  ((-1 + 2*Math.cos(theta))*Math.sqrt(Math.cos(theta) - Math.cos(theta)*Math.cos(theta))*Math.sin(phi));
    weights[8]  = Math.sqrt(30/PI)     *  ((-Math.cos(theta) + Math.cos(theta)*Math.cos(theta))*Math.sin(2*phi));

    weights[9]   = 2*Math.sqrt(35/PI)  *  Math.cos(3*phi)*Math.pow(Math.cos(theta) - Math.cos(theta)*Math.cos(theta),(3/2));
    weights[10]  = (Math.sqrt(210/PI)  *  Math.cos(2*phi)*(-1 + 2*Math.cos(theta))*(-Math.cos(theta) + Math.cos(theta)*Math.cos(theta)));
    weights[11]  = 2*Math.sqrt(21/PI)  *  Math.cos(phi)*Math.sqrt(Math.cos(theta) - Math.cos(theta)*Math.cos(theta))*(1 - 5*Math.cos(theta) + 5*Math.cos(theta)*Math.cos(theta));
    weights[12]  = Math.sqrt(7/(2*PI)) *  (-1 + 12*Math.cos(theta) - 30*Math.cos(theta)*Math.cos(theta) + 20*Math.cos(theta)*Math.cos(theta)*Math.cos(theta));
    weights[13]  = 2*Math.sqrt(21/PI)  *  Math.sqrt(Math.cos(theta) - Math.cos(theta)*Math.cos(theta))*(1 - 5*Math.cos(theta) + 5*Math.cos(theta)*Math.cos(theta))*Math.sin(phi);
    weights[14]  = (Math.sqrt(210/PI)  *  (-1 + 2*Math.cos(theta))*(-Math.cos(theta) + Math.cos(theta)*Math.cos(theta))*Math.sin(2*phi));
    weights[15]  = 2*Math.sqrt(35/PI)  *  Math.pow(Math.cos(theta) - Math.cos(theta)*Math.cos(theta),(3/2))*Math.sin(3*phi);

    var p = 0;
    for (var j = 0; j < g_DataHeight; ++j)
        for (var i = 0; i < g_DataWidth; ++i) {
            var index = j*g_DataWidth*4 + i*4;
            g_ImgData.data[index + 3] = 255;
            for (var d = 0; d < g_Dimension; ++d) {
                var value = 0;
                for (var q = 0; q < g_Terms; ++q) {
                    value += g_Pixels[p++] * weights[q];
                }
                value = getMin(value, 1.0);
                value = getMax(value, 0.0);
                g_ImgData.data[index + d] = Math.round(value * 255);
            }
        }
}

function loadHSH(raw_file) {
    var p = 0;
    var pixels = null;
    var scale = new Array();
    var bias = new Array();

    // remove the comment
    while (raw_file.charAt(p) == '#') {
        p = raw_file.indexOf('\n', p) + 1;
    }

    // RTI Type
    q = raw_file.indexOf('\n', p);
    type = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Image Width
    q = raw_file.indexOf(' ', p);
    g_DataWidth = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Image Height
    q = raw_file.indexOf(' ', p);
    g_DataHeight = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Color Dimension
    q = raw_file.indexOf('\n', p);
    g_Dimension = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Basis_terms
    q = raw_file.indexOf(' ', p);
    g_Terms = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Basis_type
    q = raw_file.indexOf(' ', p);
    g_BasicType = parseInt(raw_file.substring(p, q));
    p = q + 1;
    // Element Size
    q = raw_file.indexOf('\n', p);
    g_ElementSize = parseInt(raw_file.substring(p, q));
    p = q + 1;

    // scale
    for (var i = 0; i < g_Terms; ++i) {
        var value = 0;
        for (var c = 0; c < 4; ++c) {
            // little endian
            value += raw_file.charCodeAt(p++) << (c*8);
        }
        scale[i] = Bytes2Float32(value);
    }
    // bias
    for (var i = 0; i < g_Terms; ++i) {
        var value = 0; 
        for (var c = 0; c < 4; ++c) {
            // little endian
            value += raw_file.charCodeAt(p++) << (c*8);
        }
        bias[i] = Bytes2Float32(value);
    }

    // data
    g_DataDepth = g_Dimension * g_Terms;
    pixels = new Array(g_DataWidth * g_DataHeight * g_DataDepth);
    var index = 0;
    for (var j = 0; j < g_DataHeight; ++j)
        for (var i = 0; i < g_DataWidth; ++i)
            for (var d = 0; d < g_Dimension; ++d) 
                for (var q = 0; q < g_Terms; ++q) {
                    var c = raw_file.charCodeAt(p++);
                    var value = c / 255.0;
                    value = value * scale[q] + bias[q];
                    pixels[index++] = value;
                }

    return pixels;
}

function renderImagePTM() {
    var a = new Array(6);
    var index = 0;
    var p = 0;
    var viewpoint = new Array(0, 0, 1);

    for (var y = 0; y < g_DataHeight; ++y) {
        for (var x = 0; x < g_DataWidth; ++x) {
            for (var d = 0; d < 6; ++d) {
                a[d] = g_Pixels[index++];
            }
            var r = g_Pixels[index++];
            var g = g_Pixels[index++];
            var b = g_Pixels[index++];

            // get the luminance value
            var lum = a[0]*light[0]*light[0] + a[1]*light[1]*light[1] + a[2]*light[0]*light[1] + a[3]*light[0] + a[4]*light[1] + a[5];
            lum = lum / 255;

            if (g_IsDiffuse || g_IsSpecular) {
                // light direction
                var s = Math.sqrt(g_DataWidth*g_DataWidth + g_DataHeight*g_DataHeight) / 2;
                var u = (x - g_DataWidth / 2) / s;
                var v = (g_DataHeight / 2 - y) / s;
                var lightDir = subtract(light, new Array(u, v, 0));
                lightDir = normalize(lightDir);

                // diffuse 
                var kd = 0.4;
                if (g_IsDiffuse) {
                    var diffuse = limit(multiply(light, g_NormalMap[y][x]), 0, 1);
                    r = Math.round(r*kd*diffuse);
                    g = Math.round(g*kd*diffuse);
                    b = Math.round(b*kd*diffuse);
                }

                // specular
                var ks = 0.7;
                if (g_IsSpecular) {
                    var n = 15;
                    var h = normalize(divide(add(viewpoint, lightDir), 2));
                    var specular = Math.pow(limit(multiply(h, g_NormalMap[y][x]), 0, 1), n);
                    specular *= ks*255;
                    r = Math.round((r*kd + specular) * lum);
                    g = Math.round((g*kd + specular) * lum);
                    b = Math.round((b*kd + specular) * lum);
                }
            } else {
                r = Math.round(r * lum);
                g = Math.round(g * lum);
                b = Math.round(b * lum);
            }				

            // RGBA
            g_ImgData.data[p++] = limit(r, 0, 255);
            g_ImgData.data[p++] = limit(g, 0, 255);
            g_ImgData.data[p++] = limit(b, 0, 255);
            g_ImgData.data[p++] = 255;
        }
    }
}

function loadPTM(raw_file) {
    var p = 0;
    var pixels = null;
    var scale = new Array();
    var bias = new Array();

    // PTM version
    var q = raw_file.indexOf('\n', p);
    var version = raw_file.substring(p, q).trim();
    p = q + 1;
    if (version.match(/^PTM_\d\.\d$/) == null) {
        alert("Wrong PTM file format");
        return null;
    }

    // format of file
    q = raw_file.indexOf('\n', p);
    type = raw_file.substring(p, q).trim();
    p = q + 1;

    // image size
    q = raw_file.indexOf('\n', p);
    g_DataWidth = parseInt(raw_file.substring(p, q).trim());
    p = q + 1;
    q = raw_file.indexOf('\n', p);
    g_DataHeight = parseInt(raw_file.substring(p, q).trim());
    p = q + 1;

    // scale and bias
    q = raw_file.indexOf('\n', p);
    var str = raw_file.substring(p, q).trim();
    p = q + 1;
    var array = str.split(' ');
    if (array.length != 6 && array.length != 12) {
        alert('Wrong PTM file format');
        return null;
    }
    for (var i = 0; i < 6; ++i) {
        scale[i] = parseFloat(array[i]);
    }
    var tmp = 6;
    if (array.length == 6) {
        q = raw_file.indexOf('\n', p);
        array = raw_file.substring(p, q).trim().split(' ');
        p = q + 1;
        tmp = 0;
    }
    for (var i = 0; i < 6; ++i) {
        bias[i] = parseInt(array[tmp + i]);
    }

    // load coefficients according to different file format
    g_DataDepth = 9;
    pixels = new Array(g_DataWidth * g_DataHeight * g_DataDepth);
    g_NormalMap = new Array(g_DataHeight);
    for (var y = 0; y < g_DataHeight; ++y) {
        g_NormalMap[y] = new Array(g_DataWidth);
        for (var x = 0; x < g_DataWidth; ++x) {
            g_NormalMap[y][x] = new Array(3);
        }
    }
    switch (type) {
        case "PTM_FORMAT_LRGB": {
            var index = 0;
            var n;
            for (var y = g_DataHeight - 1; y >= 0; --y) {
                for (var x = 0; x < g_DataWidth; ++x) {
                    index = (y * g_DataWidth + x) * 9;
                    var value;
                    var d;
                    var a = new Array(6);
                    for (d = 0; d < 6; ++d) {
                        value = raw_file.charCodeAt(p++);
                        a[d] = Math.round((value - bias[d]) * scale[d]);
                        pixels[index++] = a[d];
                    }
                    g_NormalMap[y][x] = calculateNormal(a);
                    if (version == "PTM_1.1") {
                        for (d = 0; d < 3; ++d) {
                            pixels[index++] = raw_file.charCodeAt(p++);
                        }
                    }
                }
            }
            if (version == "PTM_1.2") {
                for (var y = g_DataHeight - 1; y >= 0; --y) {
                    for (var x = 0; x < g_DataWidth; ++x) {
                        index = (y * g_DataWidth + x) * 9 + 6;
                        for (d = 0; d < 3; ++d) {
                            pixels[index++] = raw_file.charCodeAt(p++);
                        }
                    }
                }
            }
            return pixels;
        }
    }
}

function calculateNormal(coefficients) {
    var a = new Array();
    for (var k = 0; k < 6; ++k) {
        a[k] = coefficients[k] / 256;
    }
    var nx, ny, nz;
    // nx = (a[2]*a[4] - 2*a[1]*a[3]) / (4*a[0]*a[1] - a[2]*a[2])
    // ny = (a[2]*a[3] - 2*a[0]*a[4]) / (4*a[0]*a[1] - a[2]*a[2])
    if (Math.abs(4*a[0]*a[1] - a[2]*a[2]) < zerotol) {
        nx = 0;
        ny = 0;
    } else {
        if (Math.abs(a[2]) < zerotol) {
            nx = a[3] / (2 * a[0]);
            ny = a[4] / (2 * a[1]);
        } else {
            nx = (a[2]*a[4] - 2*a[1]*a[3]) / (4*a[0]*a[1] - a[2]*a[2]);
            ny = (a[2]*a[3] - 2*a[0]*a[4]) / (4*a[0]*a[1] - a[2]*a[2]);
        }
    }

    if (Math.abs(a[0]) < zerotol && Math.abs(a[1]) < zerotol && Math.abs(a[2]) &&
        Math.abs(a[3]) < zerotol && Math.abs(a[4]) < zerotol && Math.abs(a[5])) {
        nz = 1;
    } else {
        var s = nx*nx + ny*ny;
        if (s > 1) {
            s = Math.sqrt(s);
            nx = nx / s;
            ny = ny / s;
            nz = 0;
        } else {
            nz = Math.sqrt(1 - s);
        }
    }

    return Array(nx, ny, nz);
}

function render(stream) {
    if (g_Pixels == null)
        return;
    // g_ImgData = {data: new Array(g_DataWidth * g_DataHeight * 4)};
    g_ImgData = stream;
    switch (g_FileExtension) {
        case "rti":
            renderImageHSH();
            break;
        case "ptm":
            renderImagePTM();
            break;
        default:
            alert("Error: undefined file extension!");
    }
}

loadFile(ARGV.input, function() {
    calcuLightPos();
    var png = new PNG({ filterType: 4, width: g_DataWidth, height: g_DataHeight });
    render(png);
    png.pack().pipe(fs.createWriteStream(ARGV.output));
});


// fs.createReadStream('in.png')
//     .pipe(new PNG({
//         filterType: 4
//     }))
//     .on('parsed', function() {

//         for (var y = 0; y < this.height; y++) {
//             for (var x = 0; x < this.width; x++) {
//                 var idx = (this.width * y + x) << 2;

//                 // invert color
//                 this.data[idx] = 255 - this.data[idx];
//                 this.data[idx+1] = 255 - this.data[idx+1];
//                 this.data[idx+2] = 255 - this.data[idx+2];

//                 // and reduce opacity
//                 this.data[idx+3] = this.data[idx+3] >> 1;
//             }
//         }

//         this.pack().pipe(fs.createWriteStream('out.png'));
//     });
