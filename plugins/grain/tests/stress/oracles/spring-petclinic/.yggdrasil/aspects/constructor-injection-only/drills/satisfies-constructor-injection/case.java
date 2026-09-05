package org.springframework.samples.petclinic.owner;

import org.springframework.stereotype.Controller;

@Controller
class OwnerController {

	private final OwnerRepository owners;

	public OwnerController(OwnerRepository owners) {
		this.owners = owners;
	}

}
