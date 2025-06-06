import * as THREE from 'three';
import { ColladaLoader } from 'three-stdlib';
import { XMLParser } from 'fast-xml-parser';

class URDFCustomLoader {
  constructor() {
    this.packages = {};
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
  }

  async load(url) {
    const response = await fetch(url);
    const xmlText = await response.text();
    const urdfData = this.parser.parse(xmlText);
    
    const robot = new THREE.Group();
    robot.name = 'robot';
    
    // Загружаем все меши
    const meshPromises = [];
    this.traverseLinks(urdfData.robot.link, robot, meshPromises);
    
    await Promise.all(meshPromises);
    return robot;
  }

  traverseLinks(links, parent, meshPromises) {
    if (!Array.isArray(links)) links = [links];
    
    links.forEach(link => {
      if (link.visual && link.visual.geometry) {
        const meshPromise = this.loadMesh(link.visual.geometry, link['@_name'])
          .then(mesh => {
            if (mesh) {
              // Применяем трансформацию
              if (link.visual.origin) {
                const origin = link.visual.origin;
                if (origin['@_xyz']) {
                  const [x, y, z] = origin['@_xyz'].split(' ').map(Number);
                  mesh.position.set(x, y, z);
                }
                if (origin['@_rpy']) {
                  const [r, p, y] = origin['@_rpy'].split(' ').map(Number);
                  mesh.rotation.set(r, p, y);
                }
              }
              mesh.name = link['@_name'];
              parent.add(mesh);
            }
          });
        meshPromises.push(meshPromise);
      }
    });
  }

  async loadMesh(geometry, linkName) {
    if (geometry.mesh) {
      const filename = geometry.mesh['@_filename'];
      if (filename) {
        const cleanPath = filename
          .replace(/^package:\/\//, '')
          .replace(/^\/?/, '/');
        
        try {
          const daeLoader = new ColladaLoader();
          const collada = await new Promise((resolve, reject) => {
            daeLoader.load(cleanPath, resolve, undefined, reject);
          });
          
          const mesh = collada.scene;
          mesh.traverse(child => {
            if (child.isMesh) {
              if (!child.material) {
                child.material = new THREE.MeshPhongMaterial({ color: 0x808080 });
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          return mesh;
        } catch (err) {
          console.error(`Ошибка загрузки модели для ${linkName}:`, err);
          return null;
        }
      }
    }
    return null;
  }
}

export default URDFCustomLoader; 