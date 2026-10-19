// SPDX-License-Identifier: Apache-2.0
// Run on the generated site's loopback origin after building checked captures.
async page=>await page.evaluate(async()=>{
 const load=async name=>{const image=new Image();image.src='/assets/'+name+'.png';await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,c.width,c.height).data;};
 const [direct,studio,exposure]=await Promise.all(['lighting-direct','lighting-studio','lighting-exposure'].map(load));let brighter=0,changed=0,gain=0,exposureGain=0,exposureDrops=0;
 for(let i=0;i<direct.length;i+=4){const luminance=a=>a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722,difference=luminance(studio)-luminance(direct),stop=luminance(exposure)-luminance(studio);if(difference>.5)brighter++;if(Math.abs(difference)>.5)changed++;gain+=difference;exposureGain+=stop;if(stop<-.5)exposureDrops++;}
 const pixels=direct.length/4,result={pixels,brighter,changed,meanBounceGain:gain/pixels,meanExposureGain:exposureGain/pixels,exposureDrops};
 if(brighter<pixels*.01||gain<=0||exposureGain<=0||exposureDrops>0)throw Error(JSON.stringify(result));return result;
})
