package org.springframework.samples.petclinic.vet;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class VetApiController {

	@GetMapping("/vets")
	public Vets showResourcesVetList() {
		return new Vets();
	}

}
